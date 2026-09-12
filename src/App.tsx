import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Columns3,
  Highlighter,
  Library,
  Link2,
  Menu,
  Moon,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, TouchEvent as ReactTouchEvent } from 'react';
import { api } from './api';
import {
  loadReaderSettings,
  ReaderSettingsPanel,
  readerFontStacks,
} from './ReaderSettings';
import type { ReaderTheme } from './ReaderSettings';
import type { Book, Passage, PassageLocation, SearchResult, Translation } from './types';

const DEFAULT_BOOK = 43;
const DEFAULT_CHAPTER = 3;
const DEFAULT_TRANSLATION = 'LUT';

function getInitialLocation() {
  const params = new URLSearchParams(window.location.search);
  const book = Number(params.get('buch'));
  const chapter = Number(params.get('kapitel'));
  return {
    bookId: Number.isInteger(book) && book > 0 ? book : DEFAULT_BOOK,
    chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : DEFAULT_CHAPTER,
    translation: params.get('uebersetzung')?.toUpperCase() ||
      localStorage.getItem('bibelraum.translation') || DEFAULT_TRANSLATION,
    verse: Number(params.get('vers')) || null,
  };
}

type SelectedVerse = {
  verse: number;
  text: string;
  translationCode: string;
};

function loadMarkedVerses() {
  try {
    const saved = JSON.parse(localStorage.getItem('bibelraum.marked-verses') ?? '[]');
    return Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function loadRecentTranslations(initialCode: string) {
  try {
    const saved = JSON.parse(localStorage.getItem('bibelraum.recent-translations') ?? '[]');
    const codes = Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [];
    return [initialCode, ...codes.filter((code) => code !== initialCode)].slice(0, 4);
  } catch {
    return [initialCode];
  }
}

function loadNumberList(key: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(saved) ? saved.filter((item): item is number => Number.isInteger(item)) : [];
  } catch {
    return [];
  }
}

function loadBookProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem('bibelraum.book-progress') ?? '{}');
    return saved && typeof saved === 'object' ? saved as Record<number, number> : {};
  } catch {
    return {};
  }
}

function getInitialTheme() {
  const saved = localStorage.getItem('bibelraum.theme');
  if (saved === 'dark' || saved === 'light' || saved === 'sepia' || saved === 'gray' || saved === 'black') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function App() {
  const initial = useMemo(getInitialLocation, []);
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([initial.translation]);
  const [recentTranslations, setRecentTranslations] = useState(() => loadRecentTranslations(initial.translation));
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState(initial.bookId);
  const [chapter, setChapter] = useState(initial.chapter);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ReaderTheme>(getInitialTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileExpandedBookId, setMobileExpandedBookId] = useState(initial.bookId);
  const [bookFilter, setBookFilter] = useState('');
  const [recentBookIds, setRecentBookIds] = useState(() => loadNumberList('bibelraum.recent-books'));
  const [bookProgress, setBookProgress] = useState(loadBookProgress);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false);
  const [readerSettings, setReaderSettings] = useState(loadReaderSettings);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedVerse, setHighlightedVerse] = useState<number | null>(initial.verse);
  const [selectedVerse, setSelectedVerse] = useState<SelectedVerse | null>(null);
  const [markedVerses, setMarkedVerses] = useState<string[]>(loadMarkedVerses);
  const [verseActionMessage, setVerseActionMessage] = useState('');
  const [readerChromeVisible, setReaderChromeVisible] = useState(true);
  const searchInput = useRef<HTMLInputElement>(null);
  const lastScrollY = useRef(window.scrollY);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const primaryCode = selectedCodes[0];
  const currentBook = books.find((book) => book.id === bookId);
  const selectedVerseKey = selectedVerse
    ? `${selectedVerse.translationCode}:${bookId}:${chapter}:${selectedVerse.verse}`
    : null;
  const readerStyle = {
    '--reader-font-size': `${readerSettings.fontSize}px`,
    '--reader-line-height': String(readerSettings.lineHeight),
    '--reader-font-family': readerFontStacks[readerSettings.fontFamily],
  } as CSSProperties;

  const openBookPicker = useCallback(() => {
    setSearchOpen(false);
    setBookFilter('');
    setMobileExpandedBookId(bookId);
    setSidebarOpen(true);
  }, [bookId]);

  useEffect(() => {
    function onScroll() {
      const currentScrollY = window.scrollY;
      const delta = currentScrollY - lastScrollY.current;

      if (currentScrollY < 72 || delta < -8) {
        setReaderChromeVisible(true);
      } else if (delta > 8 && currentScrollY > 150) {
        setReaderChromeVisible(false);
      }

      lastScrollY.current = currentScrollY;
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (sidebarOpen || translationOpen || readerSettingsOpen) {
      setReaderChromeVisible(true);
    }
  }, [sidebarOpen, translationOpen, readerSettingsOpen]);

  useEffect(() => {
    const controller = new AbortController();
    api.translations(controller.signal)
      .then((items) => {
        setTranslations(items);
        if (!items.some((item) => item.code === primaryCode)) {
          setSelectedCodes([DEFAULT_TRANSLATION]);
        }
      })
      .catch((reason: Error) => setError(reason.message));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    api.books(primaryCode, controller.signal)
      .then((items) => {
        setBooks(items);
        const matchingBook = items.find((book) => book.id === bookId);
        if (!matchingBook) {
          setBookId(items[0]?.id ?? DEFAULT_BOOK);
          setChapter(1);
        } else if (chapter > matchingBook.chapters) {
          setChapter(matchingBook.chapters);
        }
      })
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, [primaryCode]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.passage(bookId, chapter, selectedCodes, controller.signal)
      .then((data) => {
        setPassage(data);
        document.title = `${data.book.name} ${chapter} · Bibelraum`;
      })
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [bookId, chapter, selectedCodes]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('bibelraum.theme', theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      ({ light: '#f4f0e7', sepia: '#eee3ce', gray: '#e8e8e5', dark: '#171816', black: '#000000' })[theme],
    );
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = readerSettings.accent;
    document.documentElement.dataset.highlight = readerSettings.highlight;
  }, [readerSettings.accent, readerSettings.highlight]);

  useEffect(() => {
    localStorage.setItem('bibelraum.reader-settings', JSON.stringify(readerSettings));
  }, [readerSettings]);

  useEffect(() => {
    localStorage.setItem('bibelraum.marked-verses', JSON.stringify(markedVerses));
  }, [markedVerses]);

  useEffect(() => {
    localStorage.setItem('bibelraum.recent-translations', JSON.stringify(recentTranslations));
  }, [recentTranslations]);

  useEffect(() => {
    setRecentBookIds((current) => [bookId, ...current.filter((id) => id !== bookId)].slice(0, 5));
    setBookProgress((current) => ({ ...current, [bookId]: Math.max(current[bookId] ?? 0, chapter) }));
  }, [bookId, chapter]);

  useEffect(() => {
    localStorage.setItem('bibelraum.recent-books', JSON.stringify(recentBookIds));
  }, [recentBookIds]);

  useEffect(() => {
    localStorage.setItem('bibelraum.book-progress', JSON.stringify(bookProgress));
  }, [bookProgress]);

  useEffect(() => {
    if (!readerSettingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [readerSettingsOpen]);

  useEffect(() => {
    localStorage.setItem('bibelraum.translation', primaryCode);
    const params = new URLSearchParams({
      buch: String(bookId),
      kapitel: String(chapter),
      uebersetzung: primaryCode,
    });
    window.history.replaceState(null, '', `?${params}`);
  }, [bookId, chapter, primaryCode]);

  useEffect(() => {
    if (!highlightedVerse || loading) return;
    const element = document.getElementById(`vers-${highlightedVerse}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timeout = window.setTimeout(() => setHighlightedVerse(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [highlightedVerse, loading, passage]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timeout = window.setTimeout(() => {
      document.getElementById(`mobile-book-${bookId}`)?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      });
    }, 180);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timeout);
    };
  }, [sidebarOpen]);

  const goTo = useCallback((location: PassageLocation | null) => {
    if (!location) return;
    setSelectedVerse(null);
    setBookId(location.bookId);
    setChapter(location.chapter);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.matches('input, select, textarea, button')) return;
      if (event.key === 'ArrowLeft') goTo(passage?.previous ?? null);
      if (event.key === 'ArrowRight') goTo(passage?.next ?? null);
      if (event.key === '/') {
        event.preventDefault();
        setSidebarOpen(true);
        window.setTimeout(() => searchInput.current?.focus(), 50);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goTo, passage]);

  function chooseBook(nextBookId: number) {
    setSelectedVerse(null);
    setBookId(nextBookId);
    setChapter(1);
    setSidebarOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseChapter(nextBookId: number, nextChapter: number) {
    setSelectedVerse(null);
    setBookId(nextBookId);
    setChapter(nextChapter);
    setMobileExpandedBookId(nextBookId);
    setSidebarOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function choosePrimary(code: string) {
    setSelectedCodes((current) => [code, ...current.filter((item) => item !== code)].slice(0, 3));
    setRecentTranslations((current) => [code, ...current.filter((item) => item !== code)].slice(0, 4));
    setTranslationOpen(false);
  }

  function toggleComparison(code: string) {
    setSelectedCodes((current) => {
      if (current.includes(code)) {
        return current.length === 1 ? current : current.filter((item) => item !== code);
      }
      return current.length >= 3 ? current : [...current, code];
    });
  }

  async function submitSearch(event: FormEvent) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (query.length < 2) return;
    setSearching(true);
    setSearchOpen(true);
    try {
      setSearchResults(await api.search(query, primaryCode));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Suche fehlgeschlagen.');
    } finally {
      setSearching(false);
    }
  }

  function openSearchResult(result: SearchResult) {
    setSelectedVerse(null);
    setBookId(result.bookId);
    setChapter(result.chapter);
    setHighlightedVerse(result.verse);
    setSearchOpen(false);
    setSidebarOpen(false);
  }

  function verseReference(verse: SelectedVerse) {
    return `${currentBook?.name ?? passage?.book.name ?? 'Bibel'} ${chapter},${verse.verse} (${verse.translationCode})`;
  }

  async function copyText(value: string, message: string) {
    await navigator.clipboard.writeText(value);
    setVerseActionMessage(message);
    window.setTimeout(() => setVerseActionMessage(''), 1800);
  }

  async function shareVerse() {
    if (!selectedVerse) return;
    const text = `${verseReference(selectedVerse)}\n${selectedVerse.text}`;
    const url = new URL(window.location.href);
    url.searchParams.set('vers', String(selectedVerse.verse));
    if (navigator.share) {
      await navigator.share({ title: verseReference(selectedVerse), text, url: url.toString() });
    } else {
      await copyText(`${text}\n${url}`, 'Vers und Link kopiert');
    }
  }

  function toggleVerseMark() {
    if (!selectedVerseKey) return;
    setMarkedVerses((current) => current.includes(selectedVerseKey)
      ? current.filter((key) => key !== selectedVerseKey)
      : [...current, selectedVerseKey]);
  }

  function startSwipe(event: ReactTouchEvent<HTMLElement>) {
    const touch = event.changedTouches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function finishSwipe(event: ReactTouchEvent<HTMLElement>) {
    if (!touchStart.current || sidebarOpen || translationOpen || readerSettingsOpen) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;
    touchStart.current = null;

    if (Math.abs(deltaX) < 72 || Math.abs(deltaX) < Math.abs(deltaY) * 1.35) return;
    goTo(deltaX < 0 ? passage?.next ?? null : passage?.previous ?? null);
  }

  return (
    <div className={`app-shell ${readerChromeVisible ? '' : 'chrome-hidden'}`} style={readerStyle}>
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={openBookPicker} aria-label="Bücher öffnen">
          <Menu size={20} />
        </button>
        <a className="brand" href="/" aria-label="Bibelraum Startseite">
          <span className="brand-mark"><BookOpenText size={20} strokeWidth={1.8} /></span>
          <span>Bibelraum</span>
        </a>
        <div className="topbar-rule" />
        <span className="topbar-kicker">Lokal lesen</span>
        <div className="topbar-actions">
          <button
            className="translation-trigger"
            onClick={() => {
              setSidebarOpen(false);
              setReaderSettingsOpen(false);
              setTranslationOpen((open) => !open);
            }}
            aria-expanded={translationOpen}
          >
            <span className="translation-code">{primaryCode}</span>
            <span className="translation-name desktop-only">
              {translations.find((item) => item.code === primaryCode)?.name}
            </span>
            {selectedCodes.length > 1 && <span className="count-badge">+{selectedCodes.length - 1}</span>}
            <ChevronDown size={15} />
          </button>
          <button
            className="icon-button"
            onClick={() => setTheme((value) => value === 'dark' || value === 'black' ? 'light' : 'dark')}
            aria-label={theme === 'dark' || theme === 'black' ? 'Hellmodus aktivieren' : 'Dunkelmodus aktivieren'}
          >
            {theme === 'dark' || theme === 'black' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className="icon-button"
            onClick={() => {
              setTranslationOpen(false);
              setReaderSettingsOpen(true);
            }}
            aria-label="Leseansicht anpassen"
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>

        {translationOpen && (
          <>
            <button className="translation-scrim" onClick={() => setTranslationOpen(false)} aria-label="Übersetzungsauswahl schließen" />
            <TranslationMenu
              translations={translations}
              selectedCodes={selectedCodes}
              recentCodes={recentTranslations}
              onChoosePrimary={choosePrimary}
              onToggleComparison={toggleComparison}
              onClose={() => setTranslationOpen(false)}
            />
          </>
        )}
      </header>

      {readerSettingsOpen && (
        <>
          <button className="settings-scrim" onClick={() => setReaderSettingsOpen(false)} aria-label="Leseansicht schließen" />
          <ReaderSettingsPanel
            settings={readerSettings}
            theme={theme}
            onChange={setReaderSettings}
            onThemeChange={setTheme}
            onClose={() => setReaderSettingsOpen(false)}
          />
        </>
      )}

      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="Buch- und Kapitelauswahl">
        <div className="sidebar-heading">
          <button className="mobile-close mobile-only" onClick={() => setSidebarOpen(false)} aria-label="Schließen">
            <X size={25} />
          </button>
          <div className="desktop-only">
            <span className="eyebrow">Bibliothek</span>
            <h2>66 Bücher</h2>
          </div>
          <h2 className="mobile-picker-title mobile-only">Bücher & Kapitel</h2>
          <span className="mobile-heading-spacer mobile-only" aria-hidden="true" />
        </div>
        <form className="search-box" onSubmit={submitSearch}>
          <Search size={17} aria-hidden="true" />
          <input
            ref={searchInput}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Text oder Stichwort"
            aria-label="Bibel durchsuchen"
          />
          <kbd>/</kbd>
        </form>

        {searchOpen ? (
          <SearchResults
            query={searchQuery}
            results={searchResults}
            searching={searching}
            onClose={() => setSearchOpen(false)}
            onSelect={openSearchResult}
          />
        ) : (
          <>
            <div className="desktop-book-library">
              <BookLibrary books={books} currentBookId={bookId} onSelect={chooseBook} />
            </div>
            <div className="mobile-book-library">
              <label className="book-filter">
                <Search size={16} aria-hidden="true" />
                <input
                  value={bookFilter}
                  onChange={(event) => setBookFilter(event.target.value)}
                  placeholder="Buch suchen"
                  aria-label="Buch suchen"
                />
                {bookFilter && (
                  <button onClick={() => setBookFilter('')} aria-label="Buchsuche leeren"><X size={15} /></button>
                )}
              </label>
              <MobileBookPicker
                books={books}
                currentBookId={bookId}
                currentChapter={chapter}
                expandedBookId={mobileExpandedBookId}
                filter={bookFilter}
                recentBookIds={recentBookIds}
                progress={bookProgress}
                onExpand={setMobileExpandedBookId}
                onSelectChapter={chooseChapter}
              />
            </div>
          </>
        )}
        <div className="sidebar-note">
          <Library size={15} />
          <span>{translations.length || 11} deutsche Übersetzungen · vollständig lokal</span>
        </div>
      </aside>

      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Menü schließen" />}

      <main className="reader" onTouchStart={startSwipe} onTouchEnd={finishSwipe}>
        <nav className="passage-nav" aria-label="Bibelstelle auswählen">
          <button
            className="nav-arrow"
            onClick={() => goTo(passage?.previous ?? null)}
            disabled={!passage?.previous}
            aria-label="Vorheriges Kapitel"
          >
            <ArrowLeft size={18} />
          </button>
          <button className="mobile-passage-trigger mobile-only" onClick={openBookPicker}>
            <span>{currentBook?.name ?? passage?.book.name ?? 'Buch'} {chapter}</span>
            <ChevronDown size={16} />
          </button>
          <label className="select-control book-select">
            <span>Buch</span>
            <select value={bookId} onChange={(event) => chooseBook(Number(event.target.value))}>
              {books.map((book) => <option value={book.id} key={book.id}>{book.name}</option>)}
            </select>
            <ChevronDown size={15} />
          </label>
          <span className="nav-separator" />
          <label className="select-control chapter-select">
            <span>Kapitel</span>
            <select value={chapter} onChange={(event) => setChapter(Number(event.target.value))}>
              {Array.from({ length: currentBook?.chapters ?? passage?.book.chapterCount ?? 1 }, (_, index) => (
                <option value={index + 1} key={index + 1}>{index + 1}</option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>
          <button
            className="nav-arrow"
            onClick={() => goTo(passage?.next ?? null)}
            disabled={!passage?.next}
            aria-label="Nächstes Kapitel"
          >
            <ArrowRight size={18} />
          </button>
        </nav>

        <div className="reader-inner">
          {error ? (
            <div className="error-card" role="alert">
              <CircleAlert size={24} />
              <div><strong>Das hat nicht geklappt.</strong><p>{error}</p></div>
            </div>
          ) : (
            <>
              <div className="chapter-heading">
                <span className="chapter-kicker">
                  {passage?.book.testament === 1 ? 'Altes Testament' : 'Neues Testament'}
                </span>
                <h1>{passage?.book.name ?? currentBook?.name ?? 'Bibel'} <em>{chapter}</em></h1>
                <div className="heading-meta">
                  <span>{passage?.translations[0]?.name ?? 'Luther 2017'}</span>
                  {selectedCodes.length > 1 && (
                    <span className="compare-label"><Columns3 size={14} /> Parallelansicht</span>
                  )}
                </div>
              </div>

              {loading && !passage ? <ReaderSkeleton /> : passage && (
                <div className={`translation-grid columns-${passage.translations.length}`} aria-busy={loading}>
                  {passage.translations.map((translation, index) => (
                    <article className="translation-column" key={translation.code}>
                      {passage.translations.length > 1 && (
                        <div className="column-heading">
                          <span><b>{translation.code}</b> {translation.name}</span>
                          {index > 0 && (
                            <button onClick={() => toggleComparison(translation.code)} aria-label={`${translation.name} schließen`}>
                              <X size={15} />
                            </button>
                          )}
                        </div>
                      )}
                      <div className="verses">
                        {translation.verses.map((item) => (
                          <button
                            type="button"
                            id={index === 0 ? `vers-${item.verse}` : undefined}
                            className={[
                              'verse',
                              highlightedVerse === item.verse ? 'is-highlighted' : '',
                              selectedVerse?.verse === item.verse && selectedVerse.translationCode === translation.code ? 'is-selected' : '',
                              markedVerses.includes(`${translation.code}:${bookId}:${chapter}:${item.verse}`) ? 'is-marked' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => setSelectedVerse((current) => (
                              current?.verse === item.verse && current.translationCode === translation.code
                                ? null
                                : { ...item, translationCode: translation.code }
                            ))}
                            aria-pressed={selectedVerse?.verse === item.verse && selectedVerse.translationCode === translation.code}
                            key={item.verse}
                          >
                            <sup>{item.verse}</sup>
                            {item.text}
                          </button>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <nav className="chapter-footer" aria-label="Zwischen Kapiteln wechseln">
                <ChapterLink direction="previous" location={passage?.previous ?? null} onClick={goTo} />
                <div className="chapter-progress">
                  <span>{chapter}</span>
                  <i />
                  <span>{passage?.book.chapterCount ?? currentBook?.chapters ?? '–'}</span>
                </div>
                <ChapterLink direction="next" location={passage?.next ?? null} onClick={goTo} />
              </nav>
              <p className="swipe-hint mobile-only"><ArrowLeft size={13} /> Wischen zum Kapitelwechsel <ArrowRight size={13} /></p>
            </>
          )}
        </div>
      </main>

      {selectedVerse && (
        <div className="verse-actions" role="toolbar" aria-label={`Aktionen für ${verseReference(selectedVerse)}`}>
          <div className="verse-actions-reference">
            <b>{verseReference(selectedVerse)}</b>
            <span>{verseActionMessage || 'Vers ausgewählt'}</span>
          </div>
          <button onClick={() => copyText(`${verseReference(selectedVerse)}\n${selectedVerse.text}`, 'Vers kopiert')}>
            <Copy size={18} /><span>Kopieren</span>
          </button>
          <button onClick={shareVerse}>
            <Share2 size={18} /><span>Teilen</span>
          </button>
          <button onClick={() => {
            const url = new URL(window.location.href);
            url.searchParams.set('vers', String(selectedVerse.verse));
            copyText(url.toString(), 'Link kopiert');
          }}>
            <Link2 size={18} /><span>Link</span>
          </button>
          <button className={selectedVerseKey && markedVerses.includes(selectedVerseKey) ? 'active' : ''} onClick={toggleVerseMark}>
            <Highlighter size={18} /><span>Markieren</span>
          </button>
          <button className="verse-actions-close" onClick={() => setSelectedVerse(null)} aria-label="Versauswahl schließen">
            <X size={19} />
          </button>
        </div>
      )}
    </div>
  );
}

function MobileBookPicker({
  books,
  currentBookId,
  currentChapter,
  expandedBookId,
  filter,
  recentBookIds,
  progress,
  onExpand,
  onSelectChapter,
}: {
  books: Book[];
  currentBookId: number;
  currentChapter: number;
  expandedBookId: number;
  filter: string;
  recentBookIds: number[];
  progress: Record<number, number>;
  onExpand: (bookId: number) => void;
  onSelectChapter: (bookId: number, chapter: number) => void;
}) {
  const normalizedFilter = filter.trim().toLocaleLowerCase('de-DE');
  const filteredBooks = normalizedFilter
    ? books.filter((book) => book.name.toLocaleLowerCase('de-DE').includes(normalizedFilter))
    : books;
  const recentBooks = recentBookIds
    .map((id) => books.find((book) => book.id === id))
    .filter((book): book is Book => Boolean(book));

  function renderBook(book: Book) {
    const isExpanded = book.id === expandedBookId;
    const readChapter = progress[book.id] ?? 0;
    const percentage = Math.min(100, Math.round((readChapter / book.chapters) * 100));
    return (
      <div className={`mobile-book-row ${isExpanded ? 'is-expanded' : ''}`} id={`mobile-book-${book.id}`} key={book.id}>
        <button
          className={book.id === currentBookId ? 'current' : ''}
          onClick={() => onExpand(book.id)}
          aria-expanded={isExpanded}
        >
          <span>{book.name}</span>
          <small>{readChapter ? `bis Kapitel ${readChapter}` : `${book.chapters} Kapitel`}</small>
        </button>
        {readChapter > 0 && (
          <span className="book-progress" aria-label={`${percentage} Prozent gelesen`}>
            <i style={{ width: `${percentage}%` }} />
          </span>
        )}
        {isExpanded && (
          <div className="mobile-chapter-grid" aria-label={`Kapitel in ${book.name}`}>
            {Array.from({ length: book.chapters }, (_, index) => {
              const number = index + 1;
              const isCurrent = book.id === currentBookId && number === currentChapter;
              return (
                <button
                  className={`${isCurrent ? 'current' : ''} ${number <= readChapter ? 'visited' : ''}`}
                  onClick={() => onSelectChapter(book.id, number)}
                  aria-current={isCurrent ? 'page' : undefined}
                  key={number}
                >
                  {number}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mobile-book-picker">
      {!normalizedFilter && recentBooks.length > 1 && (
        <section className="recent-books">
          <h3>Zuletzt gelesen</h3>
          <div className="recent-book-list">
            {recentBooks.map((book) => (
              <button onClick={() => onExpand(book.id)} key={book.id}>
                <span>{book.name}</span><small>Kapitel {progress[book.id] || 1}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {([1, 2] as const).map((testament) => (
        <section key={testament}>
          <h3>{testament === 1 ? 'Altes Testament' : 'Neues Testament'}</h3>
          {filteredBooks.filter((book) => book.testament === testament).map(renderBook)}
        </section>
      ))}
      {filteredBooks.length === 0 && <p className="empty-book-filter">Kein Buch zu „{filter}“ gefunden.</p>}
    </div>
  );
}

function BookLibrary({ books, currentBookId, onSelect }: {
  books: Book[];
  currentBookId: number;
  onSelect: (bookId: number) => void;
}) {
  return (
    <div className="book-library">
      {([1, 2] as const).map((testament) => (
        <section key={testament}>
          <h3>{testament === 1 ? 'Altes Testament' : 'Neues Testament'}</h3>
          <div className="book-list">
            {books.filter((book) => book.testament === testament).map((book) => (
              <button
                className={book.id === currentBookId ? 'active' : ''}
                onClick={() => onSelect(book.id)}
                key={book.id}
              >
                <span>{book.name}</span><small>{book.chapters}</small>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TranslationMenu({ translations, selectedCodes, recentCodes, onChoosePrimary, onToggleComparison, onClose }: {
  translations: Translation[];
  selectedCodes: string[];
  recentCodes: string[];
  onChoosePrimary: (code: string) => void;
  onToggleComparison: (code: string) => void;
  onClose: () => void;
}) {
  const recent = recentCodes
    .map((code) => translations.find((translation) => translation.code === code))
    .filter((translation): translation is Translation => Boolean(translation));

  return (
    <div className="translation-menu" role="dialog" aria-modal="true" aria-labelledby="translation-menu-title">
      <div className="translation-handle" aria-hidden="true" />
      <div className="menu-heading">
        <div><span className="eyebrow">Ausgabe wählen</span><h2 id="translation-menu-title">Übersetzungen</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
      </div>
      <p>Wähle deinen Haupttext oder vergleiche bis zu drei Ausgaben parallel.</p>
      {recent.length > 1 && (
        <div className="recent-translations">
          <span>Zuletzt verwendet</span>
          <div>
            {recent.map((translation) => (
              <button
                className={selectedCodes[0] === translation.code ? 'active' : ''}
                onClick={() => onChoosePrimary(translation.code)}
                key={translation.code}
              >
                {translation.code}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="translation-list">
        {translations.map((translation) => {
          const isPrimary = selectedCodes[0] === translation.code;
          const isSelected = selectedCodes.includes(translation.code);
          return (
            <div className={`translation-option ${isPrimary ? 'primary' : ''}`} key={translation.code}>
              <button className="choose-translation" onClick={() => onChoosePrimary(translation.code)}>
                <span className="option-code">{translation.code}</span>
                <span><b>{translation.name}</b><small>{translation.verseCount.toLocaleString('de-DE')} Verse</small></span>
                {isPrimary && <Check size={16} />}
              </button>
              <button
                className={`compare-button ${isSelected ? 'selected' : ''}`}
                onClick={() => onToggleComparison(translation.code)}
                disabled={!isSelected && selectedCodes.length >= 3}
                aria-label={`${translation.name} ${isSelected ? 'aus Vergleich entfernen' : 'vergleichen'}`}
                title="Parallel vergleichen"
              >
                {isSelected ? <Check size={15} /> : <Plus size={15} />}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SearchResults({ query, results, searching, onClose, onSelect }: {
  query: string;
  results: SearchResult[];
  searching: boolean;
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
}) {
  return (
    <div className="search-results">
      <div className="results-heading">
        <span>{searching ? 'Suche …' : `${results.length} Treffer`}</span>
        <button onClick={onClose}>Bücher</button>
      </div>
      {!searching && results.length === 0 && (
        <div className="empty-results"><Search size={24} /><p>Keine Verse zu „{query}“ gefunden.</p></div>
      )}
      {results.map((result) => (
        <button className="search-result" onClick={() => onSelect(result)} key={`${result.bookId}-${result.chapter}-${result.verse}`}>
          <b>{result.bookName} {result.chapter},{result.verse}</b>
          <span>{result.excerpt}</span>
        </button>
      ))}
    </div>
  );
}

function ChapterLink({ direction, location, onClick }: {
  direction: 'previous' | 'next';
  location: PassageLocation | null;
  onClick: (location: PassageLocation | null) => void;
}) {
  const previous = direction === 'previous';
  return (
    <button className={`chapter-link ${direction}`} onClick={() => onClick(location)} disabled={!location}>
      {previous && <ArrowLeft size={18} />}
      <span><small>{previous ? 'Zurück' : 'Weiter'}</small><b>{location ? `${location.bookName} ${location.chapter}` : 'Ende'}</b></span>
      {!previous && <ArrowRight size={18} />}
    </button>
  );
}

function ReaderSkeleton() {
  return (
    <div className="reader-skeleton" aria-label="Kapitel wird geladen">
      {Array.from({ length: 9 }, (_, index) => <span key={index} style={{ width: `${72 + (index % 3) * 9}%` }} />)}
    </div>
  );
}
