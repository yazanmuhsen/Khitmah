const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config();

const { initDb } = require('./db');
const { setupWebSocket } = require('./websocket');
const { router: juzRoutes } = require('./routes/juz');

const app = express();
const server = http.createServer(app);

// Enable CORS for frontend Vite dev server and standard origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id']
}));

app.use(express.json());

// Request logger for API calls
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Khitmah API', time: new Date() });
});

// API Routes
app.use('/api/juz', juzRoutes);

// Serve static frontend build if present
const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Setup WebSockets
setupWebSocket(server);

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await initDb();
    server.listen(PORT, () => {
      console.log(`🌟 Khitmah Backend running on http://localhost:${PORT}`);
      console.log(`📡 WebSocket server ready at ws://localhost:${PORT}/ws`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful cleanup on exit
process.on('SIGTERM', () => {
  server.close();
});

startServer().then(async () => {
  // Warm the Quran cache in the background so readers don't wait
  const { getJuzPages } = require('./quranService');
  for (let i = 1; i <= 30; i++) {
    try { await getJuzPages(i); } catch (e) { console.warn(`Cache warm failed for Juz ${i}:`, e.message); }
  }
  console.log('Quran cache warmed for all 30 juz.');
});

module.exports = { app, server };
