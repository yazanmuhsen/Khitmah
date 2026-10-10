import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  ArrowLeft, 
  ArrowRight, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  ZoomIn, 
  ZoomOut, 
  Loader2,
  AlertCircle,
  Sparkles,
  Clock
} from 'lucide-react';
import confetti from 'canvas-confetti';

function toArabicNum(num, isArabic) {
  if (!isArabic) return num;
  const easternDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return num.toString().replace(/\d/g, d => easternDigits[d]);
}

function formatCountdown(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export default function QuranReader({
  juz,
  cooldownRemaining = 0,
  onBack,
  onReadJuz
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [juzData, setJuzData] = useState(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  
  // Font size control (saved in localStorage)
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem('khitmah_font_size');
    return saved ? parseInt(saved, 10) : 26;
  });

  const [showConfirmRead, setShowConfirmRead] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const containerRef = useRef(null);

  // Load Juz Pages strictly for this Juz
  useEffect(() => {
    let isMounted = true;
    async function fetchPages() {
           setLoading(true);
      setError(null);
      setJuzData(null);
      setCurrentPageIndex(0);
      try {
        const res = await fetch(`/api/juz/${juz.juz_number}/pages`);
        if (!res.ok) {
          throw new Error('فشل تحميل صفحات الجزء');
        }
        const data = await res.json();
        if (isMounted) {
          setJuzData(data);
          
          // Restore saved page index from localStorage if valid
          const savedPage = localStorage.getItem(`khitmah_page_juz_${juz.juz_number}`);
          if (savedPage) {
            const parsed = parseInt(savedPage, 10);
            if (parsed >= 0 && parsed < (data.pages?.length || 0)) {
              setCurrentPageIndex(parsed);
            }
          }
        }
      } catch (err) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchPages();
    return () => { isMounted = false; };
  }, [juz.juz_number]);

  // Save current page index to localStorage
  useEffect(() => {
       if (juzData && juzData.juzNumber === juz.juz_number && juzData.pages?.length > 0) {
      localStorage.setItem(`khitmah_page_juz_${juz.juz_number}`, currentPageIndex);
    }
  }, [currentPageIndex, juz.juz_number, juzData]);

  // Save font size
  const handleFontSizeChange = (delta) => {
    setFontSize(prev => {
      const next = Math.min(Math.max(prev + delta, 18), 44);
      localStorage.setItem('khitmah_font_size', next);
      return next;
    });
  };

  const isCompleted = juz.status === 'completed';
  const isCooldownActive = cooldownRemaining > 0;

  const totalPages = juzData?.pages?.length || 0;
  const currentPage = juzData?.pages?.[currentPageIndex];

  // Navigation handlers
  const handlePrevPage = () => {
    if (currentPageIndex > 0) {
      setCurrentPageIndex(prev => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleNextPage = () => {
    if (currentPageIndex < totalPages - 1) {
      setCurrentPageIndex(prev => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Keyboard navigation (Arrow keys)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowRight') {
        if (isAr) handlePrevPage(); else handleNextPage();
      } else if (e.key === 'ArrowLeft') {
        if (isAr) handleNextPage(); else handlePrevPage();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPageIndex, totalPages, isAr]);

  const handleConfirmRead = async () => {
    setActionLoading(true);
    try {
      await onReadJuz(juz);
      // Trigger celebration confetti
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
      setShowConfirmRead(false);
    } catch (err) {
      setShowConfirmRead(false);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 space-y-4">
        <Loader2 className="w-10 h-10 text-khitmah-600 animate-spin" />
        <p className="text-sm font-arabic text-stone-600 dark:text-stone-300">
          {isAr ? 'جاري تحميل صفحات المصحف الشريف...' : 'Loading Mushaf pages...'}
        </p>
      </div>
    );
  }

  if (error || !juzData) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 rounded-2xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="font-bold text-lg text-stone-900 dark:text-white font-arabic">
          {error || 'تعذر تحميل صفحات الجزء'}
        </h3>
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-khitmah-700 text-white hover:bg-khitmah-800"
        >
          {t('btnBackToDashboard')}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-28">
      
      {/* Top Reader Navigation Bar */}
      <div className="sticky top-16 z-30 backdrop-blur-md bg-stone-50/95 dark:bg-stone-950/95 py-3 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between gap-2">
        
        {/* Back to Board Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
        >
          {isAr ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          <span>{t('btnBackToDashboard')}</span>
        </button>

        {/* Juz Title Badge */}
        <div className="text-center hidden sm:block">
          <h2 className="text-sm font-bold text-khitmah-900 dark:text-khitmah-200 font-arabic">
            {isAr ? juzData.arabicName : juzData.englishName}
          </h2>
          <span className="text-[11px] text-stone-500 dark:text-stone-400">
            {t('pageLabel', { 
              current: toArabicNum(currentPageIndex + 1, isAr), 
              total: toArabicNum(totalPages, isAr), 
              mushafPage: toArabicNum(currentPage?.pageNumber || '', isAr) 
            })}
          </span>
        </div>

        {/* Font Controls & Page Selector */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          
          {/* Font Size Adjusters */}
          <div className="flex items-center bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-800 p-0.5 shadow-sm">
            <button
              onClick={() => handleFontSizeChange(-2)}
              className="p-1.5 rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              title="تصغير الخط"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-bold px-1.5 text-stone-500 min-w-[28px] text-center">
              {fontSize}
            </span>
            <button
              onClick={() => handleFontSizeChange(2)}
              className="p-1.5 rounded-lg text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              title="تكبير الخط"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          {/* Page Dropdown */}
          <select
            value={currentPageIndex}
            onChange={(e) => {
              setCurrentPageIndex(parseInt(e.target.value, 10));
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="text-xs font-bold py-1.5 px-2 rounded-xl bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 text-stone-800 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-khitmah-500"
          >
            {juzData.pages.map((p, idx) => (
              <option key={p.pageNumber} value={idx}>
                {isAr ? `صفحة ${toArabicNum(idx + 1, true)} (${toArabicNum(p.pageNumber, true)})` : `Page ${idx + 1} (${p.pageNumber})`}
              </option>
            ))}
          </select>

        </div>

      </div>

      {/* Main Mushaf Page Frame */}
      {currentPage && (
        <div 
          ref={containerRef}
          className="mushaf-page relative bg-[#faf7ee] dark:bg-[#1a1917] rounded-3xl border-2 border-[#d4af37]/40 dark:border-[#d4af37]/25 p-6 sm:p-10 md:p-12 transition-all duration-300 text-stone-900 dark:text-stone-100"
        >
          {/* Inner Decorative Golden Border */}
          <div className="absolute inset-2 sm:inset-3 rounded-2xl border border-[#d4af37]/30 dark:border-[#d4af37]/20 pointer-events-none" />

          {/* Top Page Header (Surah name & Juz name) */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-[#d4af37]/30 text-xs font-bold text-[#8c6b1f] dark:text-[#d4af37] font-arabic">
            <span>
              {currentPage.surahs[0]?.name ? `سُورَةُ ${currentPage.surahs[0].name.replace('سورة ', '')}` : ''}
            </span>
            <span className="text-[11px] font-normal text-stone-500 dark:text-stone-400">
              {t('readingNotice')}
            </span>
            <span>
              {juzData.arabicName}
            </span>
          </div>

          {/* Ayahs Flow with Surah Headers & Bismillah */}
          <div className="space-y-6">
            {currentPage.surahs.map((surah) => {
              const surahAyahs = currentPage.ayahs.filter(a => a.surah.number === surah.number);
              const startsOnThisPage = surahAyahs.some(a => a.numberInSurah === 1);

              return (
                <div key={surah.number} className="space-y-4">
                  {startsOnThisPage && (
                    <div className="my-6 p-3 text-center rounded-xl bg-gradient-to-r from-[#d4af37]/10 via-[#d4af37]/25 to-[#d4af37]/10 border border-[#d4af37]/50 shadow-inner">
                      <div className="text-lg sm:text-xl font-bold font-arabic text-[#735118] dark:text-[#fcd34d]">
                        {surah.name}
                      </div>
                      <div className="text-[11px] text-stone-600 dark:text-stone-300 font-arabic mt-0.5">
                        {surah.revelationType === 'Meccan' ? t('revelationMeccan') : t('revelationMedinan')} • {toArabicNum(surah.numberOfAyahs, isAr)} {t('ayahsCount', { count: '' })}
                      </div>
                    </div>
                  )}

                  {startsOnThisPage && surah.number !== 9 && surah.number !== 1 && (
                    <div className="text-center py-2 text-xl sm:text-2xl font-quran text-[#8c6b1f] dark:text-[#fcd34d] select-none">
                      {t('bismillah')}
                    </div>
                  )}

                  <div 
                    className="font-quran text-justify leading-[2.6] sm:leading-[2.8] text-stone-900 dark:text-stone-100 select-text"
                    style={{ fontSize: `${fontSize}px` }}
                    dir="rtl"
                  >
                    {surahAyahs.map((ayah) => (
                      <span key={ayah.number} className="inline">
                        <span className="hover:text-khitmah-700 dark:hover:text-khitmah-300 transition-colors">
                          {ayah.text}
                        </span>
                        <span className="ayah-end" title={`آية ${ayah.numberInSurah}`}>
                          <span className="relative z-10 text-[0.8em] font-bold">
                            {toArabicNum(ayah.numberInSurah, true)}
                          </span>
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Page Footer (Mushaf Page Number) */}
          <div className="mt-8 pt-4 border-t border-[#d4af37]/30 flex items-center justify-between text-xs font-bold text-[#8c6b1f] dark:text-[#d4af37] font-arabic">
            <span>
              {isAr ? `الجزء ${toArabicNum(juzData.juzNumber, true)}` : `Juz ${juzData.juzNumber}`}
            </span>
            <span className="text-sm bg-[#d4af37]/20 px-3 py-0.5 rounded-full">
              {toArabicNum(currentPage.pageNumber, isAr)}
            </span>
            <span>
              {isAr ? `صفحة ${toArabicNum(currentPageIndex + 1, true)} من ${toArabicNum(totalPages, true)}` : `${currentPageIndex + 1} of ${totalPages}`}
            </span>
          </div>

        </div>
      )}

      {/* Reader Page Footer Dedication & Logo */}
      <div className="pt-6 pb-12 text-center space-y-2 border-t border-stone-200/80 dark:border-stone-800/80 mt-10">
        <div className="flex justify-center mb-1">
          <img src="/logo.svg" alt="Khitmah Logo" className="w-7 h-7 opacity-80" />
        </div>
        <p 
          dir="rtl"
          className="font-arabic font-bold text-base sm:text-lg text-amber-900 dark:text-gold-200 tracking-wide"
        >
          صدقة جارية عن روح محمد سالم العمري رحمه الله
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400 font-arabic">
          اللهم تقبل قراءتنا واجعلها في ميزان حسناته
        </p>
      </div>

      {/* Floating Bottom Navigation & Read Action Bar */}
      <div className="fixed bottom-0 start-0 end-0 z-40 bg-white/95 dark:bg-stone-900/95 backdrop-blur-md border-t border-stone-200 dark:border-stone-800 p-3 shadow-2xl">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          
          {/* Previous Page Button */}
          <button
            onClick={handlePrevPage}
            disabled={currentPageIndex === 0}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isAr ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4 text-stone-600" />}
            <span className="hidden sm:inline">{t('prevPage')}</span>
          </button>

          {/* Center: "Read" / "قرأت" Button or Completed Indicator */}
          <div className="flex items-center gap-2">
            {isCompleted ? (
              <div className="flex items-center gap-1.5 text-xs font-bold text-khitmah-700 dark:text-khitmah-300 bg-khitmah-50 dark:bg-khitmah-950/60 px-4 py-2 rounded-xl border border-khitmah-200 dark:border-khitmah-800">
                <CheckCircle className="w-4 h-4" />
                <span>{t('statusCompleted')}</span>
              </div>
            ) : isCooldownActive ? (
              <button
                disabled
                className="flex items-center gap-2 px-5 sm:px-8 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-stone-400 bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 cursor-not-allowed"
                title={t('cooldownNotice')}
              >
                <Clock className="w-4 h-4 text-amber-500 animate-spin-slow" />
                <span>{t('btnReadCooldown', { time: formatCountdown(cooldownRemaining) })}</span>
              </button>
            ) : (
              <button
                onClick={() => setShowConfirmRead(true)}
                className="flex items-center gap-2 px-6 sm:px-10 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white bg-gradient-to-r from-khitmah-600 via-khitmah-700 to-khitmah-800 hover:from-khitmah-700 hover:to-khitmah-900 shadow-md shadow-khitmah-700/20 active:scale-95 transition-all"
              >
                <CheckCircle className="w-4 h-4 text-gold-300" />
                <span>{t('btnRead')}</span>
              </button>
            )}
          </div>

          {/* Next Page Button */}
          <button
            onClick={handleNextPage}
            disabled={currentPageIndex >= totalPages - 1}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-bold bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <span className="hidden sm:inline">{t('nextPage')}</span>
            {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

        </div>
      </div>

      {/* Confirmation Modal: Mark as Read */}
      {showConfirmRead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-stone-900 rounded-2xl shadow-2xl border border-stone-200 dark:border-stone-800 p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-khitmah-100 dark:bg-khitmah-900/50 text-khitmah-700 dark:text-khitmah-300 flex items-center justify-center mx-auto">
              <Sparkles className="w-7 h-7 text-gold-500" />
            </div>

            <h3 className="text-lg font-bold text-stone-900 dark:text-white font-arabic">
              {t('confirmReadTitle')}
            </h3>

            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 font-arabic leading-relaxed">
              {t('confirmReadDesc')}
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setShowConfirmRead(false)}
                disabled={actionLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                {t('cancelBtn')}
              </button>
              <button
                onClick={handleConfirmRead}
                disabled={actionLoading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-khitmah-700 hover:bg-khitmah-800 shadow-md transition-all disabled:opacity-60"
              >
                {actionLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{t('confirmReadBtn')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
