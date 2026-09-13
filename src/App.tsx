import {
  ArrowLeft,
  ArrowRight,
  BookMarked,
  Check,
  ChevronDown,
  CircleAlert,
  Copy,
  Columns3,
  Download,
  FlaskConical,
  Highlighter,
  Library,
  Link2,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Moon,
  Palette,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, TouchEvent as ReactTouchEvent } from 'react';
import { api } from './api';
import {
  highlightChoices,
  loadReaderSettings,
  ReaderSettingsPanel,
  readerFontStacks,
} from './ReaderSettings';
import type { HighlightColor, ReaderTheme } from './ReaderSettings';
import { readAppStorage, writeAppStorage } from './storage';
import type {
  Book,
  ChapterStudyComment,
  CommentarySource,
  Passage,
  PassageLocation,
  SearchResult,
  StudyComment,
  Translation,
} from './types';

const DEFAULT_BOOK = 43;
const DEFAULT_CHAPTER = 3;
const DEFAULT_TRANSLATION = 'LUT';
const PUBLIC_ORIGIN = 'https://bibel.samuelgesang.de';

type ReadingState = {
  bookId: number;
  chapter: number;
  translation: string;
  scrollY: number;
};

function loadReadingState(): Partial<ReadingState> {
  try {
    const saved = JSON.parse(readAppStorage('reading-state') ?? '{}');
    return saved && typeof saved === 'object' ? saved as Partial<ReadingState> : {};
  } catch {
    return {};
  }
}

function getInitialLocation() {
  const params = new URLSearchParams(window.location.search);
  const book = Number(params.get('buch'));
  const chapter = Number(params.get('kapitel'));
  const saved = loadReadingState();
  const hasUrlLocation = Number.isInteger(book) && book > 0;
  return {
    bookId: hasUrlLocation ? book : Number(saved.bookId) || DEFAULT_BOOK,
    chapter: Number.isInteger(chapter) && chapter > 0 ? chapter : Number(saved.chapter) || DEFAULT_CHAPTER,
    translation: params.get('uebersetzung')?.toUpperCase() ||
      saved.translation || readAppStorage('translation') || DEFAULT_TRANSLATION,
    verse: Number(params.get('vers')?.split(',')[0]) || null,
    scrollY: hasUrlLocation ? 0 : Math.max(0, Number(saved.scrollY) || 0),
  };
}

type SelectedVerse = {
  verse: number;
  text: string;
  translationCode: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function loadMarkedVerses() {
  try {
    const saved = JSON.parse(readAppStorage('marked-verses') ?? '[]');
    if (Array.isArray(saved)) {
      return Object.fromEntries(
        saved.filter((item): item is string => typeof item === 'string').map((key) => [key, 'yellow']),
      ) as Record<string, HighlightColor>;
    }
    if (saved && typeof saved === 'object') {
      return Object.fromEntries(
        Object.entries(saved).filter((entry): entry is [string, HighlightColor] =>
          typeof entry[0] === 'string' &&
          highlightChoices.some((choice) => choice.id === entry[1])),
      );
    }
    return {};
  } catch {
    return {};
  }
}

function loadRecentTranslations(initialCode: string) {
  try {
    const saved = JSON.parse(readAppStorage('recent-translations') ?? '[]');
    const codes = Array.isArray(saved) ? saved.filter((item): item is string => typeof item === 'string') : [];
    return [initialCode, ...codes.filter((code) => code !== initialCode)].slice(0, 4);
  } catch {
    return [initialCode];
  }
}

function loadNumberList(name: string) {
  try {
    const saved = JSON.parse(readAppStorage(name) ?? '[]');
    return Array.isArray(saved) ? saved.filter((item): item is number => Number.isInteger(item)) : [];
  } catch {
    return [];
  }
}

function loadBookProgress() {
  try {
    const saved = JSON.parse(readAppStorage('book-progress') ?? '{}');
    return saved && typeof saved === 'object' ? saved as Record<number, number> : {};
  } catch {
    return {};
  }
}

function getInitialTheme() {
  const saved = readAppStorage('theme');
  if (saved === 'dark' || saved === 'light' || saved === 'sepia' || saved === 'gray' || saved === 'black') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialExpertMode() {
  return readAppStorage('expert-mode') === 'true';
}

export function App() {
  const initial = useMemo(getInitialLocation, []);
  const [homeOpen, setHomeOpen] = useState(() => !new URLSearchParams(window.location.search).has('buch'));
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
  const [recentBookIds, setRecentBookIds] = useState(() => loadNumberList('recent-books'));
  const [bookProgress, setBookProgress] = useState(loadBookProgress);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [expertMode, setExpertMode] = useState(getInitialExpertMode);
  const [commentarySources, setCommentarySources] = useState<CommentarySource[]>([]);
  const [commentaryOpen, setCommentaryOpen] = useState(false);
  const [selectedCommentarySlug, setSelectedCommentarySlug] = useState(() => readAppStorage('commentary-source') ?? '');
  const [chapterComments, setChapterComments] = useState<ChapterStudyComment[]>([]);
  const [commentaryLoading, setCommentaryLoading] = useState(false);
  const [commentaryError, setCommentaryError] = useState('');
  const [readerSettingsOpen, setReaderSettingsOpen] = useState(false);
  const [readerSettings, setReaderSettings] = useState(loadReaderSettings);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedVerse, setHighlightedVerse] = useState<number | null>(initial.verse);
  const [selectedVerses, setSelectedVerses] = useState<SelectedVerse[]>([]);
  const [markedVerses, setMarkedVerses] = useState<Record<string, HighlightColor>>(loadMarkedVerses);
  const [verseActionMessage, setVerseActionMessage] = useState('');
  const [verseColorMenuOpen, setVerseColorMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [appInstalled, setAppInstalled] = useState(() =>
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  );
  const [readerChromeVisible, setReaderChromeVisible] = useState(true);
  const [scrollProgress, setScrollProgress] = useState(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const lastScrollY = useRef(window.scrollY);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const pendingScrollRestore = useRef(initial.scrollY);
  const verseActionMessageTimer = useRef<number | null>(null);

  const primaryCode = selectedCodes[0];
  const currentBook = books.find((book) => book.id === bookId);
  const selectedVerseKeys = selectedVerses.map(
    (verse) => `${verse.translationCode}:${bookId}:${chapter}:${verse.verse}`,
  );
  const allSelectedVersesMarked = selectedVerseKeys.length > 0 &&
    selectedVerseKeys.every((key) => Boolean(markedVerses[key]));
  const someSelectedVersesMarked = selectedVerseKeys.some((key) => Boolean(markedVerses[key]));
  const readerStyle = {
    '--reader-font-size': `${readerSettings.fontSize}px`,
    '--reader-line-height': String(readerSettings.lineHeight),
    '--reader-font-family': readerFontStacks[readerSettings.fontFamily],
    '--reader-max-width': ({ narrow: '620px', medium: '760px', wide: '900px' })[readerSettings.textWidth],
    '--reader-text-align': readerSettings.textAlign,
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
    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function onAppInstalled() {
      setInstallPrompt(null);
      setAppInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
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
    api.commentaries(controller.signal)
      .then((sources) => {
        setCommentarySources(sources);
        setSelectedCommentarySlug((current) => {
          if (sources.some((source) => source.slug === current)) return current;
          return [...sources].sort((a, b) => b.verseLinkCount - a.verseLinkCount)[0]?.slug ?? '';
        });
      })
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setCommentaryError(reason.message);
      });
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
      })
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [bookId, chapter, selectedCodes]);

  useEffect(() => {
    document.title = homeOpen
      ? 'Das Wort · Die Bibel in deinem Rhythmus'
      : `${passage?.book.name ?? currentBook?.name ?? 'Bibel'} ${chapter} · Das Wort`;
  }, [chapter, currentBook?.name, homeOpen, passage?.book.name]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    writeAppStorage('theme', theme);
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
    writeAppStorage('reader-settings', JSON.stringify(readerSettings));
  }, [readerSettings]);

  useEffect(() => {
    writeAppStorage('marked-verses', JSON.stringify(markedVerses));
  }, [markedVerses]);

  useEffect(() => {
    if (selectedVerses.length === 0) setVerseColorMenuOpen(false);
  }, [selectedVerses.length]);

  useEffect(() => {
    writeAppStorage('recent-translations', JSON.stringify(recentTranslations));
  }, [recentTranslations]);

  useEffect(() => {
    setRecentBookIds((current) => [bookId, ...current.filter((id) => id !== bookId)].slice(0, 5));
    setBookProgress((current) => ({ ...current, [bookId]: Math.max(current[bookId] ?? 0, chapter) }));
  }, [bookId, chapter]);

  useEffect(() => {
    writeAppStorage('recent-books', JSON.stringify(recentBookIds));
  }, [recentBookIds]);

  useEffect(() => {
    writeAppStorage('book-progress', JSON.stringify(bookProgress));
  }, [bookProgress]);

  useEffect(() => {
    if (!readerSettingsOpen && !translationOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [readerSettingsOpen, translationOpen]);

  useEffect(() => {
    writeAppStorage('expert-mode', String(expertMode));
    if (!expertMode) setCommentaryOpen(false);
  }, [expertMode]);

  useEffect(() => {
    if (selectedCommentarySlug) writeAppStorage('commentary-source', selectedCommentarySlug);
  }, [selectedCommentarySlug]);

  useEffect(() => {
    if (!commentaryOpen || !selectedCommentarySlug) return;
    const controller = new AbortController();
    setCommentaryLoading(true);
    setCommentaryError('');
    api.chapterComments(bookId, chapter, selectedCommentarySlug, controller.signal)
      .then(setChapterComments)
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setCommentaryError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommentaryLoading(false);
      });
    return () => controller.abort();
  }, [bookId, chapter, commentaryOpen, selectedCommentarySlug]);

  useEffect(() => {
    writeAppStorage('translation', primaryCode);
    if (homeOpen) {
      window.history.replaceState(null, '', '/');
      return;
    }
    const params = new URLSearchParams({
      buch: String(bookId),
      kapitel: String(chapter),
      uebersetzung: primaryCode,
    });
    window.history.replaceState(null, '', `?${params}`);
  }, [bookId, chapter, homeOpen, primaryCode]);

  useEffect(() => {
    if (loading || !passage || pendingScrollRestore.current <= 0) return;
    const scrollY = pendingScrollRestore.current;
    pendingScrollRestore.current = 0;
    const frame = window.requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'auto' }));
    return () => window.cancelAnimationFrame(frame);
  }, [loading, passage]);

  useEffect(() => {
    let frame = 0;
    let saveTimer = 0;

    function persistPosition() {
      writeAppStorage('reading-state', JSON.stringify({
        bookId,
        chapter,
        translation: primaryCode,
        scrollY: Math.round(window.scrollY),
      } satisfies ReadingState));
    }

    function onReadingScroll() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const scrollable = document.documentElement.scrollHeight - window.innerHeight;
        setScrollProgress(scrollable > 0 ? Math.min(1, window.scrollY / scrollable) : 0);
      });
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(persistPosition, 180);
    }

    persistPosition();
    onReadingScroll();
    window.addEventListener('scroll', onReadingScroll, { passive: true });
    window.addEventListener('beforeunload', persistPosition);
    return () => {
      window.removeEventListener('scroll', onReadingScroll);
      window.removeEventListener('beforeunload', persistPosition);
      window.cancelAnimationFrame(frame);
      window.clearTimeout(saveTimer);
    };
  }, [bookId, chapter, primaryCode]);

  useEffect(() => {
    if (!highlightedVerse || loading) return;
    const element = document.getElementById(`vers-${highlightedVerse}`);
    element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timeout = window.setTimeout(() => setHighlightedVerse(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [highlightedVerse, loading, passage]);

  useEffect(() => () => {
    if (verseActionMessageTimer.current !== null) {
      window.clearTimeout(verseActionMessageTimer.current);
    }
  }, []);

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
    setSelectedVerses([]);
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
    setSelectedVerses([]);
    setBookId(nextBookId);
    setChapter(1);
    setSidebarOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function chooseChapter(nextBookId: number, nextChapter: number) {
    setSelectedVerses([]);
    setBookId(nextBookId);
    setChapter(nextChapter);
    setMobileExpandedBookId(nextBookId);
    setSidebarOpen(false);
    setSearchOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function choosePrimary(code: string) {
    setSelectedCodes((current) => expertMode
      ? [code, ...current.filter((item) => item !== code)].slice(0, 3)
      : [code]);
    setRecentTranslations((current) => [code, ...current.filter((item) => item !== code)].slice(0, 4));
    setTranslationOpen(false);
  }

  function changeExpertMode(enabled: boolean) {
    setExpertMode(enabled);
    if (!enabled) setSelectedCodes((current) => current.slice(0, 1));
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
    setSelectedVerses([]);
    setBookId(result.bookId);
    setChapter(result.chapter);
    setHighlightedVerse(result.verse);
    setSearchOpen(false);
    setSidebarOpen(false);
  }

  function verseReference(verse: SelectedVerse) {
    return `${currentBook?.name ?? passage?.book.name ?? 'Bibel'} ${chapter},${verse.verse} (${verse.translationCode})`;
  }

  function selectionLabel() {
    if (selectedVerses.length === 1) return verseReference(selectedVerses[0]);
    const translationCodes = new Set(selectedVerses.map((verse) => verse.translationCode));
    const verseNumbers = [...new Set(selectedVerses.map((verse) => verse.verse))].sort((a, b) => a - b);
    if (translationCodes.size === 1) {
      return `${currentBook?.name ?? passage?.book.name ?? 'Bibel'} ${chapter},${verseNumbers.join('.')} (${selectedVerses[0].translationCode})`;
    }
    return `${selectedVerses.length} Verse ausgewählt`;
  }

  function selectedVerseText() {
    return selectedVerses.map((verse) => `${verseReference(verse)}\n${verse.text}`).join('\n\n');
  }

  function selectedVerseUrl() {
    const translationCodes = new Set(selectedVerses.map((verse) => verse.translationCode));
    const translationCode = translationCodes.size === 1
      ? selectedVerses[0]?.translationCode ?? primaryCode
      : primaryCode;
    const url = new URL('/', PUBLIC_ORIGIN);
    url.searchParams.set('buch', String(bookId));
    url.searchParams.set('kapitel', String(chapter));
    url.searchParams.set('uebersetzung', translationCode);
    url.searchParams.set('vers', [...new Set(selectedVerses.map((verse) => verse.verse))].sort((a, b) => a - b).join(','));
    return url;
  }

  function showVerseActionMessage(message: string) {
    if (verseActionMessageTimer.current !== null) {
      window.clearTimeout(verseActionMessageTimer.current);
    }
    setVerseActionMessage(message);
    verseActionMessageTimer.current = window.setTimeout(() => {
      setVerseActionMessage('');
      verseActionMessageTimer.current = null;
    }, 2200);
  }

  function closeVerseActions() {
    setVerseColorMenuOpen(false);
    setSelectedVerses([]);
  }

  async function copyText(value: string, message: string) {
    try {
      if (window.isSecureContext && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = value;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.append(textArea);
        textArea.select();
        const copied = document.execCommand('copy');
        textArea.remove();
        if (!copied) throw new Error('copy failed');
      }
      showVerseActionMessage(message);
    } catch {
      showVerseActionMessage('Kopieren wurde vom Browser blockiert');
    }
  }

  async function copySelectedVerses() {
    const message = `${selectedVerses.length === 1 ? 'Vers' : `${selectedVerses.length} Verse`} kopiert`;
    await copyText(selectedVerseText(), message);
    closeVerseActions();
  }

  async function copySelectedVerseLink() {
    await copyText(selectedVerseUrl().toString(), 'Link kopiert');
    closeVerseActions();
  }

  async function shareVerse() {
    if (selectedVerses.length === 0) return;
    const text = selectedVerseText();
    const url = selectedVerseUrl();
    try {
      if (!navigator.share) {
        await copyText(`${text}\n${url}`, `${selectedVerses.length === 1 ? 'Vers' : 'Verse'} und Link kopiert`);
        return;
      }
      await navigator.share({ title: selectionLabel(), text, url: url.toString() });
      showVerseActionMessage('Teilen geöffnet');
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === 'AbortError')) {
        await copyText(`${text}\n${url}`, 'Teilen nicht verfügbar – Inhalt kopiert');
      }
    } finally {
      closeVerseActions();
    }
  }

  function toggleVerseMark() {
    if (selectedVerseKeys.length === 0) return;
    if (allSelectedVersesMarked) {
      removeVerseMarks();
      return;
    }
    applyVerseColor(readerSettings.highlight);
  }

  function applyVerseColor(color: HighlightColor) {
    setMarkedVerses((current) => {
      const next = { ...current };
      selectedVerseKeys.forEach((key) => { next[key] = color; });
      return next;
    });
    setReaderSettings((current) => ({ ...current, highlight: color }));
    showVerseActionMessage(`${selectedVerseKeys.length === 1 ? 'Vers' : 'Verse'} ${highlightChoices.find((choice) => choice.id === color)?.name.toLowerCase()} markiert`);
    closeVerseActions();
  }

  function removeVerseMarks() {
    setMarkedVerses((current) => {
      const next = { ...current };
      selectedVerseKeys.forEach((key) => { delete next[key]; });
      return next;
    });
    showVerseActionMessage('Markierung entfernt');
    closeVerseActions();
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

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') setInstallPrompt(null);
  }

  if (homeOpen) {
    return (
      <HomePage
        bookName={currentBook?.name ?? passage?.book.name ?? 'Johannes'}
        chapter={chapter}
        translationCode={primaryCode}
        translationName={translations.find((item) => item.code === primaryCode)?.name ?? primaryCode}
        translationCount={translations.length || 16}
        commentaryCount={commentarySources.length || 9}
        excerpt={passage?.translations[0]?.verses.slice(0, 2).map((verse) => verse.text).join(' ') ?? ''}
        theme={theme}
        canInstall={Boolean(installPrompt) && !appInstalled}
        appInstalled={appInstalled}
        onContinue={() => setHomeOpen(false)}
        onChoosePassage={() => {
          setHomeOpen(false);
          openBookPicker();
        }}
        onToggleTheme={() => setTheme((value) => value === 'dark' || value === 'black' ? 'light' : 'dark')}
        onInstall={() => void installApp()}
      />
    );
  }

  return (
    <div className={`app-shell ${readerChromeVisible ? '' : 'chrome-hidden'} ${commentaryOpen ? 'has-commentary' : ''}`} style={readerStyle}>
      <header className="topbar">
        <button className="icon-button mobile-only" onClick={openBookPicker} aria-label="Bücher öffnen">
          <Menu size={20} />
        </button>
        <a className="brand" href="/" onClick={(event) => { event.preventDefault(); setHomeOpen(true); }} aria-label="Das Wort Startseite">
          <span className="brand-mark"><img src="/icons/das-wort.svg" alt="" /></span>
          <span>Das Wort</span>
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
          {expertMode && (
            <button
              className={`icon-button commentary-trigger ${commentaryOpen ? 'active' : ''}`}
              onClick={() => setCommentaryOpen((open) => !open)}
              aria-label={commentaryOpen ? 'Kommentarspalte schließen' : 'Kommentarspalte öffnen'}
              aria-expanded={commentaryOpen}
              disabled={commentarySources.length === 0}
            >
              <MessageSquareText size={18} />
              {commentarySources.length > 0 && <small>{commentarySources.length}</small>}
            </button>
          )}
        </div>

      </header>

      {translationOpen && (
        <>
          <button className="translation-scrim" onClick={() => setTranslationOpen(false)} aria-label="Übersetzungsauswahl schließen" />
          <TranslationMenu
            translations={translations}
            selectedCodes={selectedCodes}
            recentCodes={recentTranslations}
            expertMode={expertMode}
            onExpertModeChange={changeExpertMode}
            onChoosePrimary={choosePrimary}
            onToggleComparison={toggleComparison}
            onClose={() => setTranslationOpen(false)}
          />
        </>
      )}

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
          <span>{translations.length || 16} Übersetzungen · Deutsch &amp; English · vollständig lokal</span>
        </div>
      </aside>

      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label="Menü schließen" />}

      <main className="reader" onTouchStart={startSwipe} onTouchEnd={finishSwipe}>
        <nav className="passage-nav" aria-label="Bibelstelle auswählen">
          <span className="reading-position-progress" style={{ transform: `scaleX(${scrollProgress})` }} aria-hidden="true" />
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
                          <div className={`verse-entry ${item.commentCount > 0 ? 'has-comments' : ''}`} key={item.verse}>
                            <button
                              type="button"
                              id={index === 0 ? `vers-${item.verse}` : undefined}
                              className={[
                                'verse',
                                highlightedVerse === item.verse ? 'is-highlighted' : '',
                                selectedVerses.some((verse) => verse.verse === item.verse && verse.translationCode === translation.code) ? 'is-selected' : '',
                                markedVerses[`${translation.code}:${bookId}:${chapter}:${item.verse}`] ? 'is-marked' : '',
                              ].filter(Boolean).join(' ')}
                              style={markedVerses[`${translation.code}:${bookId}:${chapter}:${item.verse}`]
                                ? { '--verse-highlight': `var(--highlight-${markedVerses[`${translation.code}:${bookId}:${chapter}:${item.verse}`]})` } as CSSProperties
                                : undefined}
                              onClick={() => setSelectedVerses((current) => {
                                const exists = current.some((verse) => verse.verse === item.verse && verse.translationCode === translation.code);
                                return exists
                                  ? current.filter((verse) => verse.verse !== item.verse || verse.translationCode !== translation.code)
                                  : [...current, { ...item, translationCode: translation.code }];
                              })}
                              aria-pressed={selectedVerses.some((verse) => verse.verse === item.verse && verse.translationCode === translation.code)}
                            >
                              <sup>{item.verse}</sup>
                              {item.text}
                            </button>
                            {index === 0 && item.commentCount > 0 && (
                              <StudyCommentMarker
                                bookId={bookId}
                                chapter={chapter}
                                verse={item.verse}
                                count={item.commentCount}
                              />
                            )}
                          </div>
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

      {commentaryOpen && (
        <CommentaryPanel
          sources={commentarySources}
          selectedSlug={selectedCommentarySlug}
          comments={chapterComments}
          loading={commentaryLoading}
          error={commentaryError}
          bookName={currentBook?.name ?? passage?.book.name ?? 'Bibel'}
          chapter={chapter}
          onSelectSource={setSelectedCommentarySlug}
          onClose={() => setCommentaryOpen(false)}
          onJumpToVerse={(verse) => {
            setHighlightedVerse(verse);
            document.getElementById(`vers-${verse}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (window.matchMedia('(max-width: 760px)').matches) setCommentaryOpen(false);
          }}
        />
      )}

      {selectedVerses.length > 0 && (
        <div className="verse-actions" role="toolbar" aria-label={`Aktionen für ${selectionLabel()}`}>
          {verseColorMenuOpen && (
            <div className="verse-color-menu" role="dialog" aria-label="Markierungsfarbe auswählen">
              <div>
                <span><Palette size={15} /> Markierungsfarbe</span>
                <button onClick={() => setVerseColorMenuOpen(false)} aria-label="Farbauswahl schließen"><X size={16} /></button>
              </div>
              <p>Die gewählte Farbe wird zugleich Standard für neue Markierungen.</p>
              <div className="verse-color-grid">
                {highlightChoices.map((color) => (
                  <button onClick={() => applyVerseColor(color.id)} key={color.id}>
                    <i className={color.id} />
                    <span>{color.name}</span>
                    {readerSettings.highlight === color.id && <Check size={13} />}
                  </button>
                ))}
              </div>
              {someSelectedVersesMarked && (
                <button className="remove-verse-mark" onClick={removeVerseMarks}><Trash2 size={14} /> Markierung entfernen</button>
              )}
            </div>
          )}
          <div className="verse-actions-reference">
            <b>{selectionLabel()}</b>
            <span role="status">{verseActionMessage || `${selectedVerses.length} ${selectedVerses.length === 1 ? 'Vers' : 'Verse'} ausgewählt`}</span>
          </div>
          <button onClick={() => void copySelectedVerses()}>
            <Copy size={18} /><span>Kopieren</span>
          </button>
          <button onClick={() => void shareVerse()}>
            <Share2 size={18} /><span>Teilen</span>
          </button>
          <button onClick={() => void copySelectedVerseLink()}>
            <Link2 size={18} /><span>Link</span>
          </button>
          <button className={allSelectedVersesMarked ? 'active' : ''} onClick={toggleVerseMark}>
            <Highlighter size={18} /><span>Markieren</span>
          </button>
          <button className={verseColorMenuOpen ? 'active' : ''} onClick={() => setVerseColorMenuOpen((open) => !open)}>
            <Palette size={18} /><span>Farbe</span>
          </button>
          <button className="verse-actions-close" onClick={closeVerseActions} aria-label="Versauswahl schließen">
            <X size={19} />
          </button>
        </div>
      )}
      {verseActionMessage && <span className="action-toast" role="status">{verseActionMessage}</span>}
    </div>
  );
}

function CommentaryPanel({
  sources,
  selectedSlug,
  comments,
  loading,
  error,
  bookName,
  chapter,
  onSelectSource,
  onClose,
  onJumpToVerse,
}: {
  sources: CommentarySource[];
  selectedSlug: string;
  comments: ChapterStudyComment[];
  loading: boolean;
  error: string;
  bookName: string;
  chapter: number;
  onSelectSource: (slug: string) => void;
  onClose: () => void;
  onJumpToVerse: (verse: number) => void;
}) {
  const source = sources.find((item) => item.slug === selectedSlug);
  const groupedComments = useMemo(() => {
    const groups = new Map<number, ChapterStudyComment[]>();
    comments.forEach((comment) => {
      groups.set(comment.verse, [...(groups.get(comment.verse) ?? []), comment]);
    });
    return [...groups.entries()];
  }, [comments]);

  function qualityLabel(value: string) {
    if (!value) return '';
    if (value.includes('Publisher-quality')) return 'Verlagstext';
    if (value.includes('LOCAL-OCR')) return 'Lokale OCR · mögliche Erkennungsfehler';
    if (value.includes('OCR')) return 'Historische OCR · mögliche Erkennungsfehler';
    return value;
  }

  return (
    <aside className="commentary-panel" aria-label="Kommentarspalte">
      <span className="commentary-handle mobile-only" aria-hidden="true" />
      <header className="commentary-heading">
        <div>
          <span className="eyebrow">Expertenansicht</span>
          <h2>Kommentare</h2>
        </div>
        <button onClick={onClose} aria-label="Kommentarspalte schließen"><X size={19} /></button>
      </header>

      <label className="commentary-source-select">
        <span>Kommentarwerk</span>
        <select value={selectedSlug} onChange={(event) => onSelectSource(event.target.value)}>
          {(['de', 'en'] as const).map((languageCode) => {
            const languageSources = sources.filter((item) => item.languageCode === languageCode);
            return languageSources.length > 0 && (
              <optgroup label={languageCode === 'de' ? 'Deutsch' : 'English'} key={languageCode}>
                {languageSources.map((item) => <option value={item.slug} key={item.slug}>{item.title}</option>)}
              </optgroup>
            );
          })}
        </select>
        <ChevronDown size={16} />
      </label>

      {source && (
        <details className="commentary-profile">
          <summary>
            <span>
              <b>{source.author || source.title}</b>
              <small>
                {source.languageCode === 'en' ? 'English' : 'Deutsch'} · {source.scope || `${source.sectionCount.toLocaleString('de-DE')} Abschnitte`}
                {source.referenceTranslationCode && ` · Referenz: ${source.referenceTranslationCode}`}
              </small>
            </span>
            <ChevronDown size={15} />
          </summary>
          {source.theologicalProfile && <p>{source.theologicalProfile}</p>}
          {qualityLabel(source.sourceQuality) && <span className="commentary-quality"><CircleAlert size={13} /> {qualityLabel(source.sourceQuality)}</span>}
          {source.mappingWarning && <p>{source.mappingWarning}</p>}
          {source.sourceUrl && <a href={source.sourceUrl.split(' ; ')[0]} target="_blank" rel="noreferrer"><Link2 size={13} /> Quelle öffnen</a>}
        </details>
      )}

      <div className="commentary-location">
        <BookMarked size={15} />
        <span><b>{bookName} {chapter}</b><small>{groupedComments.length} kommentierte Verse</small></span>
      </div>

      <div className="commentary-content" aria-live="polite">
        {loading && <div className="commentary-state"><LoaderCircle size={20} /> Kommentare werden geladen …</div>}
        {error && <div className="commentary-state error"><CircleAlert size={20} /> {error}</div>}
        {!loading && !error && groupedComments.length === 0 && (
          <div className="commentary-state">
            <MessageSquareText size={23} />
            <b>Keine direkte Verknüpfung</b>
            <span>Dieses Werk enthält für das aktuelle Kapitel keine sicher zugeordneten Verskommentare.</span>
          </div>
        )}
        {!loading && !error && groupedComments.map(([verse, verseComments]) => (
          <section className="commentary-verse-group" key={verse}>
            <button onClick={() => onJumpToVerse(verse)}>Vers {verse}</button>
            {verseComments.map((comment) => (
              <article key={comment.id}>
                {comment.heading && <h3>{comment.heading}</h3>}
                <p>{comment.text}</p>
                {(comment.page || comment.sourceUrl) && (
                  <footer>
                    {comment.page && <span>Seite {comment.page}</span>}
                    {comment.sourceUrl && <a href={comment.sourceUrl.split(' ; ')[0]} target="_blank" rel="noreferrer">Quelle</a>}
                  </footer>
                )}
              </article>
            ))}
          </section>
        ))}
      </div>
    </aside>
  );
}

function HomePage({
  bookName,
  chapter,
  translationCode,
  translationName,
  translationCount,
  commentaryCount,
  excerpt,
  theme,
  canInstall,
  appInstalled,
  onContinue,
  onChoosePassage,
  onToggleTheme,
  onInstall,
}: {
  bookName: string;
  chapter: number;
  translationCode: string;
  translationName: string;
  translationCount: number;
  commentaryCount: number;
  excerpt: string;
  theme: ReaderTheme;
  canInstall: boolean;
  appInstalled: boolean;
  onContinue: () => void;
  onChoosePassage: () => void;
  onToggleTheme: () => void;
  onInstall: () => void;
}) {
  return (
    <div className="home-shell">
      <header className="home-topbar">
        <a className="brand" href="/" aria-label="Das Wort Startseite">
          <span className="brand-mark"><img src="/icons/das-wort.svg" alt="" /></span>
          <span>Das Wort</span>
        </a>
        <span className="home-topbar-note">Lesen · Verstehen · Bewahren</span>
        <button className="icon-button" onClick={onToggleTheme} aria-label={theme === 'dark' || theme === 'black' ? 'Hellmodus aktivieren' : 'Dunkelmodus aktivieren'}>
          {theme === 'dark' || theme === 'black' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>

      <main className="home-main">
        <section className="home-intro" aria-labelledby="home-title">
          <div className="home-copy">
            <span className="eyebrow">Deine Bibel. Dein Raum.</span>
            <h1 id="home-title">Die Bibel in deinem Rhythmus.</h1>
            <p>Lies ungestört, vergleiche Übersetzungen und entdecke Hintergründe – an einem Ort, der sich nach dir richtet.</p>
            <div className="home-actions">
              <button className="primary-action" onClick={onContinue}>
                Weiterlesen <ArrowRight size={18} />
              </button>
              <button className="secondary-action" onClick={onChoosePassage}>
                <Search size={17} /> Stelle auswählen
              </button>
              {canInstall && (
                <button className="secondary-action install-action" onClick={onInstall}>
                  <Download size={17} /> App installieren
                </button>
              )}
            </div>
            {appInstalled && <span className="installed-note"><Check size={14} /> Als App installiert</span>}
          </div>

          <button className="continue-card" onClick={onContinue} aria-label={`Weiterlesen bei ${bookName} ${chapter}`}>
            <span className="continue-card-topline">
              <span><BookMarked size={15} /> Zuletzt gelesen</span>
              <span className="translation-code">{translationCode}</span>
            </span>
            <strong>{bookName} <em>{chapter}</em></strong>
            <span className="continue-translation">{translationName}</span>
            {excerpt && <q>{excerpt}</q>}
            <span className="continue-link">Kapitel öffnen <ArrowRight size={17} /></span>
          </button>
        </section>

        <section className="home-features" aria-label="Funktionen von Das Wort">
          <article>
            <Library size={19} />
            <div><strong>{translationCount} Übersetzungen</strong><span>Einzeln lesen oder parallel vergleichen</span></div>
          </article>
          <article>
            <MessageSquareText size={19} />
            <div><strong>{commentaryCount} Kommentarwerke</strong><span>Hintergründe genau dort, wo du sie brauchst</span></div>
          </article>
          <article>
            <Download size={19} />
            <div><strong>Wie eine echte App</strong><span>Auf dem Home-Bildschirm, ohne Konto</span></div>
          </article>
        </section>
      </main>

      <footer className="home-footer">
        <span>Das Wort</span>
        <span>Ein ruhiger Ort für Gottes Wort.</span>
      </footer>
    </div>
  );
}

function StudyCommentMarker({ bookId, chapter, verse, count }: {
  bookId: number;
  chapter: number;
  verse: number;
  count: number;
}) {
  const [comments, setComments] = useState<StudyComment[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pinned, setPinned] = useState(false);
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => () => requestController.current?.abort(), []);

  async function loadComments() {
    if (comments || loading) return;
    const controller = new AbortController();
    requestController.current = controller;
    setLoading(true);
    setError('');
    try {
      setComments(await api.comments(bookId, chapter, verse, undefined, controller.signal));
    } catch (reason) {
      if (reason instanceof Error && reason.name !== 'AbortError') {
        setError(reason.message);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  function togglePinned() {
    void loadComments();
    setPinned((current) => !current);
  }

  return (
    <div
      className={`study-comment-marker-wrap ${pinned ? 'is-pinned' : ''}`}
      onPointerEnter={() => void loadComments()}
      onFocus={() => void loadComments()}
    >
      {pinned && <button className="study-comment-scrim" onClick={() => setPinned(false)} aria-label="Kommentar schließen" />}
      <button
        className="study-comment-marker"
        onClick={togglePinned}
        aria-label={`${count} ${count === 1 ? 'Studienkommentar' : 'Studienkommentare'} zu Vers ${verse}`}
        aria-expanded={pinned}
      >
        <MessageSquareText size={14} />
        {count > 1 && <small>{count}</small>}
      </button>
      <aside className="study-comment-popover" aria-live="polite">
        <header>
          <span><BookMarked size={15} /> Studienkommentar zu Vers {verse}</span>
          <button onClick={() => setPinned(false)} aria-label="Kommentar schließen"><X size={17} /></button>
        </header>
        {loading && <div className="comment-loading"><LoaderCircle size={18} /> Kommentar wird geladen …</div>}
        {error && <p className="comment-error">{error}</p>}
        {comments?.map((comment) => (
          <article key={comment.id}>
            <div className="comment-source">
              <b>{comment.sourceTitle}</b>
              {(comment.author || comment.page) && <span>{[comment.author, comment.page ? `Seite ${comment.page}` : ''].filter(Boolean).join(' · ')}</span>}
            </div>
            {comment.heading && <h3>{comment.heading}</h3>}
            <p>{comment.text}</p>
            <details>
              <summary>Einordnung, Quelle und Nutzung</summary>
              {comment.theologicalProfile && <p>{comment.theologicalProfile}</p>}
              {comment.scope && <p>Umfang: {comment.scope}</p>}
              {comment.sourceQuality && <p>Textqualität: {comment.sourceQuality}</p>}
              {comment.copyright && <p>{comment.copyright}</p>}
              {comment.usageNotice && <p>{comment.usageNotice}</p>}
              {comment.sourceUrl && <p><a href={comment.sourceUrl.split(' ; ')[0]} target="_blank" rel="noreferrer">Quelle öffnen</a></p>}
            </details>
          </article>
        ))}
        {!loading && comments?.length === 0 && <p className="comment-error">Kein Kommentar verfügbar.</p>}
        {!pinned && comments && <span className="comment-pin-hint">Antippen, um den Kommentar geöffnet zu halten</span>}
      </aside>
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

function TranslationMenu({ translations, selectedCodes, recentCodes, expertMode, onExpertModeChange, onChoosePrimary, onToggleComparison, onClose }: {
  translations: Translation[];
  selectedCodes: string[];
  recentCodes: string[];
  expertMode: boolean;
  onExpertModeChange: (enabled: boolean) => void;
  onChoosePrimary: (code: string) => void;
  onToggleComparison: (code: string) => void;
  onClose: () => void;
}) {
  const recent = recentCodes
    .map((code) => translations.find((translation) => translation.code === code))
    .filter((translation): translation is Translation => Boolean(translation));
  const languageGroups = ([
    { code: 'de', label: 'Deutsch' },
    { code: 'en', label: 'English' },
  ] as const).map((language) => ({
    ...language,
    translations: translations.filter((translation) => translation.languageCode === language.code),
  })).filter((language) => language.translations.length > 0);

  return (
    <div className={`translation-menu ${expertMode ? 'is-expert' : ''}`} role="dialog" aria-modal="true" aria-labelledby="translation-menu-title">
      <div className="translation-handle" aria-hidden="true" />
      <div className="menu-heading">
        <div><span className="eyebrow">Ausgabe wählen</span><h2 id="translation-menu-title">Übersetzungen</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Schließen"><X size={18} /></button>
      </div>
      <p>{expertMode ? 'Wähle einen Haupttext und bis zu zwei weitere Ausgaben für die Parallelansicht.' : 'Wähle eine Bibelübersetzung für deine Leseansicht.'}</p>
      <button className="expert-mode-toggle" onClick={() => onExpertModeChange(!expertMode)} aria-pressed={expertMode}>
        <FlaskConical size={18} />
        <span><b>Expertenmodus</b><small>Mehrere Übersetzungen parallel vergleichen</small></span>
        <i><span /></i>
      </button>
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
        {languageGroups.map((language) => (
          <section className="translation-language-group" key={language.code}>
            <h3>{language.label}</h3>
            {language.translations.map((translation) => {
              const isPrimary = selectedCodes[0] === translation.code;
              const isSelected = selectedCodes.includes(translation.code);
              return (
                <div className={`translation-option ${isPrimary ? 'primary' : ''}`} key={translation.code}>
                  <button className="choose-translation" onClick={() => onChoosePrimary(translation.code)}>
                    <span className="option-code">{translation.code}</span>
                    <span><b>{translation.name}</b><small>{translation.verseCount.toLocaleString('de-DE')} Verse</small></span>
                    {isPrimary && <Check size={16} />}
                  </button>
                  {expertMode && (
                    <button
                      className={`compare-button ${isSelected ? 'selected' : ''}`}
                      onClick={() => onToggleComparison(translation.code)}
                      disabled={!isSelected && selectedCodes.length >= 3}
                      aria-label={`${translation.name} ${isSelected ? 'aus Vergleich entfernen' : 'vergleichen'}`}
                      title="Parallel vergleichen"
                    >
                      {isSelected ? <Check size={15} /> : <Plus size={15} />}
                    </button>
                  )}
                </div>
              );
            })}
          </section>
        ))}
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
