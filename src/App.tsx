import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Check,
  ChevronDown,
  CircleAlert,
  Columns3,
  Library,
  Menu,
  Moon,
  Plus,
  Search,
  Sun,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
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
  };
}

function getInitialTheme() {
  const saved = localStorage.getItem('bibelraum.theme');
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function App() {
  const initial = useMemo(getInitialLocation, []);
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([initial.translation]);
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState(initial.bookId);
  const [chapter, setChapter] = useState(initial.chapter);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedVerse, setHighlightedVerse] = useState<number | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const primaryCode = selectedCodes[0];
  const currentBook = books.find((book) => book.id === bookId);

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
      theme === 'dark' ? '#171816' : '#f4f0e7',
    );
  }, [theme]);

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

  const goTo = useCallback((location: PassageLocation | null) => {
    if (!location) return;
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
    setBookId(nextBookId);
    setChapter(1);
    setSidebarOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function choosePrimary(code: string) {
    setSelectedCodes((current) => [code, ...current.filter((item) => item !== code)].slice(0, 3));
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
    setBookId(result.bookId);
    setChapter(result.chapter);
    setHighlightedVerse(result.verse);
    setSearchOpen(false);
    setSidebarOpen(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={() => setSidebarOpen(true)} aria-label="Bücher öffnen">
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
            onClick={() => setTranslationOpen((open) => !open)}
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
            onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')}
            aria-label={theme === 'light' ? 'Dunkelmodus aktivieren' : 'Hellmodus aktivieren'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>

        {translationOpen && (
          <TranslationMenu
            translations={translations}
            selectedCodes={selectedCodes}
            onChoosePrimary={choosePrimary}
            onToggleComparison={toggleComparison}
            onClose={() => setTranslationOpen(false)}
          />
        )}
      </header>

      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="sidebar-heading">
          <div>
            <span className="eyebrow">Bibliothek</span>
            <h2>66 Bücher</h2>
          </div>
          <button className="icon-button mobile-only" onClick={() => setSidebarOpen(false)} aria-label="Schließen">
            <X size={20} />
          </button>
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
          <BookLibrary books={books} currentBookId={bookId} onSelect={chooseBook} />
        )}
        <div className="sidebar-note">
          <Library size={15} />
          <span>{translations.length || 11} deutsche Übersetzungen · vollständig lokal</span>
        </div>
      </aside>

      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Menü schließen" />}

      <main className="reader">
        <nav className="passage-nav" aria-label="Bibelstelle auswählen">
          <button
            className="nav-arrow"
            onClick={() => goTo(passage?.previous ?? null)}
            disabled={!passage?.previous}
            aria-label="Vorheriges Kapitel"
          >
            <ArrowLeft size={18} />
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
                          <p
                            id={index === 0 ? `vers-${item.verse}` : undefined}
                            className={highlightedVerse === item.verse ? 'is-highlighted' : ''}
                            key={item.verse}
                          >
                            <sup>{item.verse}</sup>
                            {item.text}
                          </p>
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
            </>
          )}
        </div>
      </main>
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

function TranslationMenu({ translations, selectedCodes, onChoosePrimary, onToggleComparison, onClose }: {
  translations: Translation[];
  selectedCodes: string[];
  onChoosePrimary: (code: string) => void;
  onToggleComparison: (code: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="translation-menu">
      <div className="menu-heading">
        <div><span className="eyebrow">Ausgabe wählen</span><h2>Übersetzungen</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
      </div>
      <p>Wähle deinen Haupttext oder vergleiche bis zu drei Ausgaben parallel.</p>
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
