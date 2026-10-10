import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ThemeProvider } from './context/ThemeContext';
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import QuranReader from './components/QuranReader';
import Footer from './components/Footer';
import { getOrCreateDeviceId } from './utils/deviceId';
import confetti from 'canvas-confetti';
import { Sparkles, X, CheckCircle2, AlertCircle } from 'lucide-react';

function KhitmahApp() {
  const { t, i18n } = useTranslation();

  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard' or 'reader'
  const [selectedJuz, setSelectedJuz] = useState(null);

  // Board state
  const [juzList, setJuzList] = useState([]);
  const [counter, setCounter] = useState({
    totalCompleted: 0,
    currentProgress: 0,
    availableCount: 30,
    totalJuz: 30
  });

  // Cooldown countdown state in seconds
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  const [isWsConnected, setIsWsConnected] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [khitmahCelebration, setKhitmahCelebration] = useState(false);

  const wsRef = useRef(null);

  // 1-second interval to tick down cooldown timer locally
  useEffect(() => {
    if (cooldownRemaining <= 0) return;
    const timer = setInterval(() => {
      setCooldownRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownRemaining]);

  // Fetch Board Data
  const fetchBoardData = useCallback(async () => {
    try {
      const deviceId = getOrCreateDeviceId();
      const res = await fetch(`/api/juz?device_id=${encodeURIComponent(deviceId)}`, {
        headers: {
          'x-device-id': deviceId
        }
      });
      if (res.ok) {
        const data = await res.json();
        setJuzList(data.juzList || []);
        if (data.counter) {
          setCounter(data.counter);
        }
        if (data.cooldown) {
          setCooldownRemaining(data.cooldown.remainingSeconds || 0);
        }

        // If currently in reader, update selectedJuz with newest status
              // Keep the CURRENT selection, only refresh its status
        setSelectedJuz(prev => {
          if (!prev) return prev;
          const updated = data.juzList?.find(j => j.juz_number === prev.juz_number);
          return updated || prev;
        });
      }
    } catch (err) {
      console.warn('Failed to fetch board data:', err.message);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchBoardData();
  }, []);

  // Polling fallback every 10 seconds
  useEffect(() => {
    const pollInterval = setInterval(() => {
      fetchBoardData();
    }, 10000);
    return () => clearInterval(pollInterval);
  }, [fetchBoardData]);

  // WebSocket Connection
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    function connectWs() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsWsConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'BOARD_UPDATE') {
              fetchBoardData();
              if (message.data?.action === 'KHITMAH_RESET' || message.data?.khitmahFinished) {
                // Celebrate Khitmah completion!
                setKhitmahCelebration(true);
                confetti({
                  particleCount: 200,
                  spread: 100,
                  origin: { y: 0.5 }
                });
              }
            }
          } catch (e) {
            // non-json
          }
        };

        ws.onclose = () => {
          setIsWsConnected(false);
          reconnectTimeout = setTimeout(connectWs, 4000);
        };

        ws.onerror = () => {
          setIsWsConnected(false);
        };
      } catch (e) {
        console.warn('WebSocket init failed, using polling fallback');
      }
    }

    connectWs();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [fetchBoardData]);

  const showToast = (message, type = 'info') => {
    setToastMessage({ message, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 6000);
  };

  // "Read" / "قرأت" handler
  const handleReadJuz = async (targetJuz) => {
    const deviceId = getOrCreateDeviceId();

    try {
      const res = await fetch(`/api/juz/${targetJuz.juz_number}/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': deviceId
        }
      });
      const data = await res.json();

      if (res.status === 409) {
        // Someone else already completed it a moment earlier
        await fetchBoardData();
        showToast(data.message || t('alreadyCompletedAlertDesc'), 'warning');
        setActiveView('dashboard');
        return;
      }

      if (res.status === 429) {
        // Cooldown active
        setCooldownRemaining(data.remainingSeconds || 0);
        showToast(data.message || t('cooldownNotice'), 'warning');
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || 'حدث خطأ');
      }

      // Success! Update cooldown and board
      setCooldownRemaining(data.remainingSeconds || 2700);
      await fetchBoardData();
      showToast(data.message, 'success');

      if (data.khitmahFinished) {
        setKhitmahCelebration(true);
        confetti({
          particleCount: 250,
          spread: 120,
          origin: { y: 0.5 }
        });
      }

      // Immediately return to dashboard as required
      setActiveView('dashboard');
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-stone-900 dark:text-stone-100 flex flex-col font-sans transition-colors duration-200">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 start-1/2 -translate-x-1/2 z-50 animate-bounce-short">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold border backdrop-blur-md max-w-md ${
            toastMessage.type === 'error'
              ? 'bg-rose-50/95 dark:bg-rose-950/95 text-rose-800 dark:text-rose-200 border-rose-300 dark:border-rose-800'
              : toastMessage.type === 'warning'
              ? 'bg-amber-50/95 dark:bg-amber-950/95 text-amber-900 dark:text-amber-100 border-amber-300 dark:border-amber-700'
              : toastMessage.type === 'success'
              ? 'bg-emerald-50/95 dark:bg-emerald-950/95 text-emerald-900 dark:text-emerald-100 border-emerald-300 dark:border-emerald-800'
              : 'bg-stone-900/95 text-white border-stone-700'
          }`}>
            {toastMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />}
            {toastMessage.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />}
            {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />}
            <span>{toastMessage.message}</span>
            <button onClick={() => setToastMessage(null)} className="p-0.5 hover:opacity-70 ms-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Khitmah Completion Celebration Banner */}
      {khitmahCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="max-w-lg w-full bg-white dark:bg-stone-900 rounded-3xl p-8 text-center border-2 border-gold-400 dark:border-gold-600 shadow-2xl space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-gold-500 to-amber-300 text-stone-900 flex items-center justify-center mx-auto shadow-lg shadow-gold-500/30">
              <Sparkles className="w-9 h-9" />
            </div>

            <h2 className="text-2xl font-bold font-arabic text-khitmah-900 dark:text-khitmah-100">
              {t('khitmahCompletedAlertTitle')}
            </h2>

            <p className="text-sm font-arabic text-stone-600 dark:text-stone-300 leading-relaxed">
              {t('khitmahCompletedAlertDesc')}
            </p>

            <button
              onClick={() => {
                setKhitmahCelebration(false);
                setActiveView('dashboard');
              }}
              className="mt-4 px-8 py-3 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-khitmah-700 to-khitmah-900 hover:from-khitmah-800 hover:to-black shadow-md transition-all"
            >
              {t('navHome')}
            </button>
          </div>
        </div>
      )}

      {/* Main Navbar */}
      <Navbar
        isWsConnected={isWsConnected}
        onGoHome={() => setActiveView('dashboard')}
      />

      {/* Content View */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeView === 'dashboard' ? (
          <Dashboard
            juzList={juzList}
            counter={counter}
            cooldownRemaining={cooldownRemaining}
            onOpenReader={(target) => {
              setSelectedJuz(target);
              setActiveView('reader');
            }}
          />
        ) : (
          <QuranReader
            juz={selectedJuz}
            cooldownRemaining={cooldownRemaining}
            onBack={() => setActiveView('dashboard')}
            onReadJuz={handleReadJuz}
          />
        )}
      </main>

      {/* Footer on every page */}
      <Footer />

    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <KhitmahApp />
    </ThemeProvider>
  );
}
