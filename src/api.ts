import type { Book, Passage, SearchResult, Translation } from './types';

async function request<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Die Daten konnten nicht geladen werden.');
  }
  return response.json() as Promise<T>;
}

export const api = {
  translations: (signal?: AbortSignal) => request<Translation[]>('/api/translations', signal),
  books: (translation: string, signal?: AbortSignal) =>
    request<Book[]>(`/api/books?translation=${encodeURIComponent(translation)}`, signal),
  passage: (bookId: number, chapter: number, translations: string[], signal?: AbortSignal) =>
    request<Passage>(
      `/api/passage/${bookId}/${chapter}?translations=${encodeURIComponent(translations.join(','))}`,
      signal,
    ),
  search: (query: string, translation: string, signal?: AbortSignal) =>
    request<SearchResult[]>(
      `/api/search?q=${encodeURIComponent(query)}&translation=${encodeURIComponent(translation)}`,
      signal,
    ),
};
