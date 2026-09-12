export type Translation = {
  code: string;
  name: string;
  copyright: string;
  permissions: string;
  verseCount: number;
};

export type Book = {
  id: number;
  name: string;
  testament: 1 | 2;
  chapters: number;
};

export type PassageLocation = {
  bookId: number;
  bookName: string;
  chapter: number;
};

export type Passage = {
  book: {
    id: number;
    name: string;
    testament: 1 | 2;
    chapterCount: number;
  };
  chapter: number;
  previous: PassageLocation | null;
  next: PassageLocation | null;
  translations: Array<{
    code: string;
    name: string;
    verses: Array<{ verse: number; text: string; commentCount: number }>;
  }>;
};

export type StudyComment = {
  id: number;
  sourceTitle: string;
  author: string;
  copyright: string;
  usageNotice: string;
  text: string;
  sourceUrl: string;
};

export type SearchResult = {
  bookId: number;
  bookName: string;
  chapter: number;
  verse: number;
  excerpt: string;
};
