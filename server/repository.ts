import type { DatabaseSync } from 'node:sqlite';

type TranslationRow = {
  code: string;
  name: string;
  copyright: string;
  permissions: string;
  verseCount: number;
};

type StudyCommentRow = {
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

type CommentarySourceRow = {
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

export class BibleRepository {
  constructor(private readonly db: DatabaseSync) {}

  getTranslations() {
    return this.db.prepare(`
      SELECT t.code, t.name, t.copyright, t.permissions, COUNT(v.verse) AS verseCount
      FROM translations t
      LEFT JOIN verses v ON v.translation_id = t.id
      GROUP BY t.id
      ORDER BY t.name COLLATE NOCASE
    `).all() as TranslationRow[];
  }

  getBooks(translationCode: string) {
    return this.db.prepare(`
      SELECT b.ref_id AS id, bn.name, b.testament, MAX(v.chapter) AS chapters
      FROM translations t
      JOIN book_names bn ON bn.translation_id = t.id
      JOIN books b ON b.ref_id = bn.book_ref_id
      JOIN verses v ON v.translation_id = t.id AND v.book_ref_id = b.ref_id
      WHERE t.code = ?
      GROUP BY b.ref_id, bn.name, b.testament, b.position
      ORDER BY b.position
    `).all(translationCode) as Array<{
      id: number;
      name: string;
      testament: number;
      chapters: number;
    }>;
  }

  getPassage(bookId: number, chapter: number, translationCodes: string[]) {
    const placeholders = translationCodes.map(() => '?').join(', ');
    const translationRows = this.db.prepare(`
      SELECT id, code, name FROM translations
      WHERE code IN (${placeholders})
      ORDER BY CASE code ${translationCodes.map((_, index) => `WHEN ? THEN ${index}`).join(' ')} END
    `).all(...translationCodes, ...translationCodes) as Array<{
      id: number;
      code: string;
      name: string;
    }>;

    if (translationRows.length === 0) return null;

    const primary = translationRows[0];
    const book = this.db.prepare(`
      SELECT b.ref_id AS id, bn.name, b.testament, MAX(v.chapter) AS chapterCount
      FROM books b
      JOIN book_names bn ON bn.book_ref_id = b.ref_id AND bn.translation_id = ?
      JOIN verses v ON v.book_ref_id = b.ref_id AND v.translation_id = ?
      WHERE b.ref_id = ?
      GROUP BY b.ref_id, bn.name, b.testament
    `).get(primary.id, primary.id, bookId) as
      | { id: number; name: string; testament: number; chapterCount: number }
      | undefined;

    if (!book || chapter < 1 || chapter > book.chapterCount) return null;

    const versesStatement = this.db.prepare(`
      SELECT verse, text FROM verses
      WHERE translation_id = ? AND book_ref_id = ? AND chapter = ?
      ORDER BY verse
    `);

    const commentCounts = new Map(
      (this.db.prepare(`
      SELECT links.verse, COUNT(DISTINCT comments.source_id) AS commentCount
      FROM study_comment_links links
      JOIN study_comments comments ON comments.id = links.comment_id
      WHERE links.book_ref_id = ? AND links.chapter = ?
      GROUP BY links.verse
    `).all(bookId, chapter) as Array<{
        verse: number;
        commentCount: number;
      }>).map((row) => [row.verse, row.commentCount]),
    );

    const translations = translationRows.map((translation) => {
      const verses = versesStatement.all(translation.id, bookId, chapter) as Array<{
        verse: number;
        text: string;
      }>;
      return {
        code: translation.code,
        name: translation.name,
        verses: verses.map((verse) => ({
          ...verse,
          commentCount: commentCounts.get(verse.verse) ?? 0,
        })),
      };
    });

    const previous = this.getAdjacentChapter(primary.id, bookId, chapter, -1);
    const next = this.getAdjacentChapter(primary.id, bookId, chapter, 1);
    return { book, chapter, previous, next, translations };
  }

  getCommentaries() {
    return this.db.prepare(`
      SELECT sources.slug,
             sources.translation_code AS referenceTranslationCode,
             sources.title,
             sources.author,
             sources.copyright,
             sources.usage_notice AS usageNotice,
             sources.scope,
             sources.theological_profile AS theologicalProfile,
             sources.source_quality AS sourceQuality,
             sources.source_url AS sourceUrl,
             sources.mapping_warning AS mappingWarning,
             COUNT(DISTINCT comments.id) AS sectionCount,
             COUNT(links.comment_id) AS verseLinkCount
      FROM study_sources sources
      LEFT JOIN study_comments comments ON comments.source_id = sources.id
      LEFT JOIN study_comment_links links ON links.comment_id = comments.id
      GROUP BY sources.id
      ORDER BY sources.title COLLATE NOCASE
    `).all() as CommentarySourceRow[];
  }

  getStudyComments(
    bookId: number,
    chapter: number,
    verse: number,
    sourceSlug?: string,
  ) {
    return this.db.prepare(`
      SELECT comments.id,
             sources.slug AS sourceSlug,
             sources.title AS sourceTitle,
             sources.author,
             sources.scope,
             sources.theological_profile AS theologicalProfile,
             sources.source_quality AS sourceQuality,
             sources.mapping_warning AS mappingWarning,
             sources.copyright,
             sources.usage_notice AS usageNotice,
             comments.heading,
             comments.page,
             comments.mapping_quality AS mappingQuality,
             comments.text,
             COALESCE(NULLIF(links.source_url, ''), sources.source_url) AS sourceUrl
      FROM study_comment_links links
      JOIN study_comments comments ON comments.id = links.comment_id
      JOIN study_sources sources ON sources.id = comments.source_id
      WHERE links.book_ref_id = ?
        AND links.chapter = ?
        AND links.verse = ?
        AND (? IS NULL OR sources.slug = ?)
      ORDER BY sources.title COLLATE NOCASE, comments.page, comments.id
    `).all(bookId, chapter, verse, sourceSlug ?? null, sourceSlug ?? null) as StudyCommentRow[];
  }

  getChapterStudyComments(bookId: number, chapter: number, sourceSlug: string) {
    return this.db.prepare(`
      SELECT comments.id,
             links.verse,
             sources.slug AS sourceSlug,
             sources.title AS sourceTitle,
             sources.author,
             sources.scope,
             sources.theological_profile AS theologicalProfile,
             sources.source_quality AS sourceQuality,
             sources.mapping_warning AS mappingWarning,
             sources.copyright,
             sources.usage_notice AS usageNotice,
             comments.heading,
             comments.page,
             comments.mapping_quality AS mappingQuality,
             comments.text,
             COALESCE(NULLIF(links.source_url, ''), sources.source_url) AS sourceUrl
      FROM study_comment_links links
      JOIN study_comments comments ON comments.id = links.comment_id
      JOIN study_sources sources ON sources.id = comments.source_id
      WHERE links.book_ref_id = ?
        AND links.chapter = ?
        AND sources.slug = ?
      ORDER BY links.verse, comments.page, comments.id
    `).all(bookId, chapter, sourceSlug) as Array<StudyCommentRow & { verse: number }>;
  }

  private getAdjacentChapter(
    translationId: number,
    bookId: number,
    chapter: number,
    direction: -1 | 1,
  ) {
    const comparator = direction === -1 ? '<' : '>';
    const order = direction === -1 ? 'DESC' : 'ASC';
    return (this.db.prepare(`
      SELECT v.book_ref_id AS bookId, v.chapter, bn.name AS bookName
      FROM verses v
      JOIN book_names bn ON bn.translation_id = v.translation_id AND bn.book_ref_id = v.book_ref_id
      WHERE v.translation_id = ?
        AND (v.book_ref_id * 1000 + v.chapter) ${comparator} (? * 1000 + ?)
      GROUP BY v.book_ref_id, v.chapter, bn.name
      ORDER BY v.book_ref_id ${order}, v.chapter ${order}
      LIMIT 1
    `).get(translationId, bookId, chapter) ?? null) as
      | { bookId: number; chapter: number; bookName: string }
      | null;
  }

  search(query: string, translationCode: string, limit = 40) {
    const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
    if (terms.length === 0) return [];
    const predicates = terms.map(() => 'v.text LIKE ? COLLATE NOCASE').join(' AND ');

    return this.db.prepare(`
      SELECT
        v.book_ref_id AS bookId,
        bn.name AS bookName,
        v.chapter,
        v.verse,
        v.text AS excerpt
      FROM translations t
      JOIN verses v ON v.translation_id = t.id
      JOIN book_names bn ON bn.translation_id = t.id AND bn.book_ref_id = v.book_ref_id
      WHERE t.code = ? AND ${predicates}
      ORDER BY v.book_ref_id, v.chapter, v.verse
      LIMIT ?
    `).all(
      translationCode,
      ...terms.map((term) => `%${term}%`),
      Math.min(Math.max(limit, 1), 100),
    );
  }
}
