# Khitmah (خَتْمَة) 📖✨
### Collaborative Community Quran Completion Platform | مشروع الختمة الجماعية للقرآن الكريم

**Khitmah** is a lightweight, responsive full-stack web application designed for communities to collaboratively recite and complete the Holy Quran together without sign-ups or accounts.

Anyone can browse all 30 Juz', open any available Juz', recite its exact Quranic text in authentic Uthmani script (strictly mapped to standard 604-page Madani Mushaf page boundaries), and press "Read" ("قرأت") to mark it complete for the community. Once all 30 Juz' are completed, the system atomically completes the Khitmah, increments the community counter, and resets the board for the next Khitmah.

---

## 🌟 Key Features

1. **No Authentication or Accounts**:
   - Zero login, passwords, or registration.
   - Users participate immediately upon opening the app.

2. **Open Reading & Simultaneous Recitation**:
   - No reservation locks. Any available Juz' can be opened and read by anyone.
   - Several people can read the same Juz' at the same time.

3. **"Read" ("قرأت") Button & Concurrency Safety**:
   - At the bottom of the Quran Reader, a single "Read" ("قرأت") button is displayed.
   - On press, the server marks that Juz' completed via a conditional update (`status = 'available'`), locking it for everyone and returning the user to the dashboard.
   - If someone else completed the Juz' a moment earlier, the request is rejected with a friendly notification.
   - When all 30 Juz' are completed, an atomic PostgreSQL transaction increments the global Khitmah counter by 1 and resets all 30 Juz' to Available.

4. **45-Minute Anonymous Cooldown**:
   - After marking a Juz' as Read, the user enters a 45-minute cooldown before they can complete another Juz'.
   - Users are tracked anonymously via a persistent `device_id` (cookie and `localStorage`) and client IP address.
   - The cooldown is strictly enforced on the server in `POST /api/juz/:n/read`.
   - The client displays the button disabled with a live `mm:ss` countdown timer.
   - Users can still browse and recite any Juz' freely during the cooldown.

5. **Authentic Quran Reader (مصحف المدينة النبوية)**:
   - Displays **ONLY** the Quran pages belonging to the selected Juz' (no access to other Juz' text).
   - Authentic Uthmani script typography (`Amiri Quran` / `Scheherazade New`).
   - Surah headers, Bismillah decorations, and traditional Quranic verse markers (`۝`).
   - Reader controls: font size adjustments (`A-` / `A+`), page navigation (next/prev, jump-to-page selector), and saved reading position in `localStorage`.

6. **Real-Time Synchronization**:
   - WebSockets broadcast live updates (`BOARD_UPDATE`) whenever a Juz' is completed or reset.
   - Fallback polling every 10 seconds ensures reliable updates across all clients.

7. **Bilingual i18n & Theming**:
   - Arabic (Default) with automatic RTL layout (`dir="rtl"`).
   - English with automatic LTR layout (`dir="ltr"`).
   - Dark mode & Light mode toggle, stored in `localStorage`, respecting system preference on first load.

---

## 🛠️ Tech Stack

- **Frontend**: React, Vite, Tailwind CSS, Lucide React, `react-i18next`, `canvas-confetti`
- **Backend**: Node.js, Express, WebSocket (`ws`)
- **Database**: PostgreSQL
  - **Zero-Config Embedded Mode**: Uses `@electric-sql/pglite` by default (real PostgreSQL engine running in-process with persistent storage in `./server/data/pgdata`).
  - **External Mode**: Connects via `pg` (`node-postgres`) whenever `DATABASE_URL` is configured in `.env`.
- **Quran Data**: `api.alquran.cloud` (Uthmani edition) with automated in-memory & disk caching (`./server/cache`).

---

