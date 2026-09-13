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
  sourceSlug: string;
  sourceTitle: string;
  author: string;
  scope: string;
  theologicalProfile: string;
  sourceQuality: string;
  mappingWarning: string;
  copyright: string;
  usageNotice: string;
  heading: string;
  page: number | null;
  mappingQuality: string;
  text: string;
  sourceUrl: string;
};

export type ChapterStudyComment = StudyComment & { verse: number };

export type CommentarySource = {
  slug: string;
  referenceTranslationCode: string;
  title: string;
  author: string;
  copyright: string;
  usageNotice: string;
  scope: string;
  theologicalProfile: string;
  sourceQuality: string;
  sourceUrl: string;
  mappingWarning: string;
  sectionCount: number;
  verseLinkCount: number;
};

export type SearchResult = {
  bookId: number;
  bookName: string;
  chapter: number;
  verse: number;
  excerpt: string;
};
