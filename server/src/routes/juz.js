const express = require('express');
const db = require('../db');
const { getJuzPages, getAllJuzMetadata } = require('../quranService');
const { broadcast } = require('../websocket');

const router = express.Router();
const COOLDOWN_SECONDS = 10; // 45 minutes = 2700 seconds

// Helper to extract device ID and normalized IP address
function getClientIdentifier(req) {
  // Device ID can come from custom header, cookie, or query
  let deviceId = req.headers['x-device-id'];
  if (!deviceId && req.headers.cookie) {
    const match = req.headers.cookie.match(/khitmah_device_id=([^;]+)/);
    if (match) deviceId = decodeURIComponent(match[1]);
  }
  if (!deviceId && req.query.device_id) {
    deviceId = req.query.device_id;
  }
  deviceId = (deviceId || '').trim();

  // Normalize IP
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  // Strip IPv6-mapped IPv4 prefix
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) {
    ip = ip.replace('::ffff:', '');
  }

  return { deviceId, ip };
}

// Helper to check cooldown for a device or IP
async function checkCooldown(deviceId, ip) {
   if (!deviceId) {
    return { active: false, remainingSeconds: 0 };
  }

  const queryConditions = [];
  const queryParams = [];

  if (deviceId) {
    queryParams.push(deviceId);
    queryConditions.push(`device_id = $${queryParams.length}`);
  }
  

  const sql = `
    SELECT last_read_at, EXTRACT(EPOCH FROM (NOW() - last_read_at)) AS elapsed_seconds
    FROM reader_cooldown
    WHERE ${queryConditions.join(' OR ')}
    ORDER BY last_read_at DESC
    LIMIT 1
  `;

  const res = await db.query(sql, queryParams);
  if (res.rows.length === 0) {
    return { active: false, remainingSeconds: 0 };
  }

  const elapsed = parseFloat(res.rows[0].elapsed_seconds) || 0;
  if (elapsed < COOLDOWN_SECONDS) {
    const remainingSeconds = Math.ceil(COOLDOWN_SECONDS - elapsed);
    return { active: true, remainingSeconds };
  }

  return { active: false, remainingSeconds: 0 };
}

// GET all 30 Juz statuses, progress, and device cooldown
router.get('/', async (req, res) => {
  try {
    const { deviceId, ip } = getClientIdentifier(req);
    const cooldownInfo = await checkCooldown(deviceId, ip);

    const juzRes = await db.query(`
      SELECT juz_number, status, completed_at
      FROM juz_status
      ORDER BY juz_number ASC
    `);

    const counterRes = await db.query('SELECT total_completed FROM khitmah_counter WHERE id = 1');
    const totalCompletedKhitmahs = counterRes.rows[0] ? counterRes.rows[0].total_completed : 0;

    const metadata = getAllJuzMetadata();
    const list = juzRes.rows.map(row => {
      const meta = metadata[row.juz_number] || {};
      return {
        ...row,
        arabicName: meta.arabicName || `الجزء ${row.juz_number}`,
        englishName: meta.englishName || `Juz ${row.juz_number}`,
        startPage: meta.start,
        endPage: meta.end
      };
    });

    const completedCount = list.filter(j => j.status === 'completed').length;
    const availableCount = list.filter(j => j.status === 'available').length;

    res.json({
      juzList: list,
      counter: {
        totalCompleted: totalCompletedKhitmahs,
        currentProgress: completedCount,
        availableCount,
        totalJuz: 30
      },
      cooldown: cooldownInfo,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error fetching juz list:', err);
    res.status(500).json({ error: 'Failed to fetch juz status' });
  }
});

// POST Mark Juz as Completed ("Read" / "قرأت") with conditional update and cooldown check
router.post('/:id/read', async (req, res) => {
  const juzId = parseInt(req.params.id, 10);
  const { deviceId, ip } = getClientIdentifier(req);

  if (isNaN(juzId) || juzId < 1 || juzId > 30) {
    return res.status(400).json({ error: 'Invalid Juz number. Must be between 1 and 30.' });
  }

  if (!deviceId) {
    return res.status(400).json({ error: 'Device identifier required' });
  }

  try {
    // 1. Check cooldown (45 minutes)
    const cooldown = await checkCooldown(deviceId, ip);
    if (cooldown.active) {
      return res.status(429).json({
        error: 'cooldown_active',
        message: 'عذراً، يجب الانتظار ٤٥ دقيقة بين كل قراءة وأخرى لمنح الفرصة للجميع',
        remainingSeconds: cooldown.remainingSeconds
      });
    }

    // 2. Perform conditional atomic update
    const result = await db.transaction(async (tx) => {
      // Conditional update: only updates if status is currently 'available'
      const updateRes = await tx.query(
        `UPDATE juz_status
         SET status = 'completed', completed_at = CURRENT_TIMESTAMP
         WHERE juz_number = $1 AND status = 'available'
         RETURNING *`,
        [juzId]
      );

      if (updateRes.rowCount === 0) {
        // Juz was already completed by someone else
        throw {
          status: 409,
          message: 'هذا الجزء تم إتمامه بالفعل من قِبل قارئ آخر للتو. تقبل الله من الجميع!'
        };
      }

      // 3. Record cooldown for device and IP
      await tx.query(
        `INSERT INTO reader_cooldown (device_id, ip_address, last_read_at)
         VALUES ($1, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (device_id) 
         DO UPDATE SET ip_address = $2, last_read_at = CURRENT_TIMESTAMP`,
        [deviceId, ip]
      );

      // 4. Check if all 30 Juz are now completed
      const countRes = await tx.query(`SELECT COUNT(*) as completed_count FROM juz_status WHERE status = 'completed'`);
      const completedCount = parseInt(countRes.rows[0].completed_count, 10);

      let khitmahFinished = false;
      const counterRes = await tx.query('SELECT total_completed FROM khitmah_counter WHERE id = 1');
      let newTotalKhitmahs = counterRes.rows[0]?.total_completed || 0;

      if (completedCount === 30) {
        // Atomic Khitmah Reset!
        khitmahFinished = true;
        const incRes = await tx.query(
          'UPDATE khitmah_counter SET total_completed = total_completed + 1 WHERE id = 1 RETURNING total_completed'
        );
        newTotalKhitmahs = incRes.rows[0].total_completed;

        // Reset all 30 juz to available
        await tx.query(`UPDATE juz_status SET status = 'available', completed_at = NULL`);
        console.log(`🎉 KHITMAH #${newTotalKhitmahs} COMPLETED! Resetting all 30 Juz to available.`);
      }

      return {
        khitmahFinished,
        totalCompletedKhitmahs: newTotalKhitmahs,
        completedCount: khitmahFinished ? 0 : completedCount
      };
    });

    // Broadcast real-time update
    broadcast('BOARD_UPDATE', {
      action: result.khitmahFinished ? 'KHITMAH_RESET' : 'COMPLETED',
      juzNumber: juzId,
      khitmahFinished: result.khitmahFinished,
      totalCompletedKhitmahs: result.totalCompletedKhitmahs
    });

    res.json({
      message: result.khitmahFinished
        ? 'مبارك! أتمت الأمة الختمة بنجاح، وتم بدء ختمة جديدة تلقائياً'
        : 'تقبل الله! تم تسجيل إتمام قراءة الجزء بنجاح',
      juzNumber: juzId,
      khitmahFinished: result.khitmahFinished,
      totalCompletedKhitmahs: result.totalCompletedKhitmahs,
      remainingSeconds: COOLDOWN_SECONDS
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Read error:', err);
    res.status(500).json({ error: 'Internal server error while marking juz as read' });
  }
});

// GET Quran Pages strictly for a Juz
router.get('/:id/pages', async (req, res) => {
  const juzId = parseInt(req.params.id, 10);

  if (isNaN(juzId) || juzId < 1 || juzId > 30) {
    return res.status(400).json({ error: 'Invalid Juz number. Must be between 1 and 30.' });
  }

  try {
    const juzData = await getJuzPages(juzId);
    res.json(juzData);
  } catch (err) {
    console.error(`Error loading pages for Juz ${juzId}:`, err);
    res.status(500).json({ error: `Failed to load Quran pages for Juz ${juzId}` });
  }
});

module.exports = {
  router
};
