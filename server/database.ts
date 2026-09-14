import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { DatabaseSync } from 'node:sqlite';
import unzipper from 'unzipper';

const translationCodes: Record<string, string> = {
  'Elberfelder': 'ELB',
  'Einheitsübersetzung': 'EU',
  'Gute Nachricht Bibel': 'GNB',
  'Hoffnung für alle': 'HFA',
  'Luther 2017': 'LUT',
  'Menge Bibel': 'MENG',
  'Neue evangelistische Übersetzung': 'NEÜ',
  'Neues Leben. Die Bibel': 'NLB',
  'Schlachter 2000': 'SLT',
  'Volxbibel': 'VXB',
  'Zürcher Bibel': 'ZB',
  'Die Bibel in deutscher Fassung (Jantzen/Jettel)': 'BDF',
  'Neue Genfer Übersetzung (veröffentlichte Bücher)': 'NGÜ',
  'Berean Standard Bible': 'BSB',
  'World English Bible': 'WEB',
  'Literal Standard Version': 'LSV',
};

const DATABASE_SCHEMA_VERSION = '5';

export type StudyReferenceRange = {
  startChapter: number;
  startVerse: number;
  endChapter: number;
  endVerse: number;
};

export function parseLeadingStudyReference(text: string): StudyReferenceRange | null {
  const match = text.match(
    /^\s*(\d{1,3})\s*,\s*(\d{1,3})[a-z]?(?:\s*[-–]\s*(?:(\d{1,3})\s*,\s*)?(\d{1,3})[a-z]?)?\s*:/i,
  );
  if (!match) return null;

  const startChapter = Number(match[1]);
  const startVerse = Number(match[2]);
  const endChapter = match[4] ? Number(match[3] || startChapter) : startChapter;
  const endVerse = match[4] ? Number(match[4]) : startVerse;
  const startPosition = startChapter * 1000 + startVerse;
  const endPosition = endChapter * 1000 + endVerse;
  if (startChapter < 1 || startVerse < 1 || endPosition < startPosition) return null;
  return { startChapter, startVerse, endChapter, endVerse };
}

export function createSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS translations (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      language_code TEXT NOT NULL DEFAULT 'de',
      copyright TEXT NOT NULL DEFAULT '',
      permissions TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS books (
      ref_id INTEGER PRIMARY KEY,
      testament INTEGER NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS book_names (
      translation_id INTEGER NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
      book_ref_id INTEGER NOT NULL REFERENCES books(ref_id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      PRIMARY KEY (translation_id, book_ref_id)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS verses (
      translation_id INTEGER NOT NULL REFERENCES translations(id) ON DELETE CASCADE,
      book_ref_id INTEGER NOT NULL REFERENCES books(ref_id) ON DELETE CASCADE,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      text TEXT NOT NULL,
      PRIMARY KEY (translation_id, book_ref_id, chapter, verse)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS study_sources (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      translation_code TEXT NOT NULL,
      language_code TEXT NOT NULL DEFAULT 'de',
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      copyright TEXT NOT NULL DEFAULT '',
      usage_notice TEXT NOT NULL DEFAULT '',
      scope TEXT NOT NULL DEFAULT '',
      theological_profile TEXT NOT NULL DEFAULT '',
      source_quality TEXT NOT NULL DEFAULT '',
      source_url TEXT NOT NULL DEFAULT '',
      mapping_warning TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS study_comments (
      id INTEGER PRIMARY KEY,
      source_id INTEGER NOT NULL REFERENCES study_sources(id) ON DELETE CASCADE,
      source_comment_id INTEGER NOT NULL,
      heading TEXT NOT NULL DEFAULT '',
      page INTEGER,
      mapping_quality TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      UNIQUE (source_id, source_comment_id)
    );
    CREATE TABLE IF NOT EXISTS study_comment_links (
      comment_id INTEGER NOT NULL REFERENCES study_comments(id) ON DELETE CASCADE,
      book_ref_id INTEGER NOT NULL REFERENCES books(ref_id) ON DELETE CASCADE,
      chapter INTEGER NOT NULL,
      verse INTEGER NOT NULL,
      source_url TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (comment_id, book_ref_id, chapter, verse)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS idx_study_comment_links_reference
      ON study_comment_links(book_ref_id, chapter, verse);
  `);
}

function getMeta(db: DatabaseSync, key: string) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

function setMeta(db: DatabaseSync, key: string, value: string) {
  db.prepare(`
    INSERT INTO app_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

async function archiveSignature(archivePath: string) {
  const details = await stat(archivePath);
  return `${details.size}:${Math.trunc(details.mtimeMs)}`;
}

async function extractModules(archivePath: string, destination: string, prefix = 'module') {
  const archive = await unzipper.Open.file(archivePath);
  const modules = archive.files.filter(
    (entry) => entry.type === 'File' && entry.path.toLowerCase().endsWith('.sqlite'),
  );

  if (modules.length === 0) {
    throw new Error(`Das Archiv ${path.basename(archivePath)} enthält keine .sqlite-Module.`);
  }

  const extracted: string[] = [];
  for (const [index, entry] of modules.entries()) {
    const target = path.join(destination, `${prefix}-${index}.sqlite`);
    await pipeline(entry.stream(), createWriteStream(target));
    extracted.push(target);
  }
  return extracted;
}

function readStudyMetadata(db: DatabaseSync) {
  const rows = db.prepare('SELECT key, value FROM source.study_metadata').all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map(({ key, value }) => [key, value ?? '']));
}

function sourceTableExists(db: DatabaseSync, table: string) {
  return Boolean(db.prepare(`
    SELECT 1 FROM source.sqlite_schema WHERE type = 'table' AND name = ?
  `).get(table));
}

function sourceColumnNames(db: DatabaseSync, table: string) {
  return new Set(
    (db.prepare(`PRAGMA source.table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name),
  );
}

function moduleKind(modulePath: string) {
  const source = new DatabaseSync(modulePath, { readOnly: true });
  try {
    const tables = new Set(
      (source.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all() as Array<{ name: string }>).map((row) => row.name),
    );
    if (tables.has('study_comment') && tables.has('study_comment_link')) return 'study';
    if (tables.has('metadata') && tables.has('book') && tables.has('verse')) return 'bible';
    return 'unknown';
  } finally {
    source.close();
  }
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'studienkommentar';
}

function resolveTranslationCode(sourceName: string) {
  if (/\bBSB reference text\b/i.test(sourceName)) return 'BSB';
  return translationCodes[sourceName] ?? sourceName.toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, '');
}

function resolveLanguageCode(metadata: Record<string, string>) {
  return metadata.language_id === '10' ? 'en' : 'de';
}

function readStudySourceValue(db: DatabaseSync, column: string) {
  if (!sourceTableExists(db, 'study_source')) return '';
  const columns = sourceColumnNames(db, 'study_source');
  if (!columns.has(column)) return '';
  return ((db.prepare(`
    SELECT GROUP_CONCAT(DISTINCT ${column}) AS value FROM source.study_source
  `).get() as { value?: string } | undefined)?.value ?? '');
}

function readSourceMetadata(db: DatabaseSync) {
  const rows = db.prepare('SELECT key, value FROM source.metadata').all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map(({ key, value }) => [key, value ?? '']));
}

function refineMacArthurStudyLinks(
  db: DatabaseSync,
  sourceId: number,
  title: string,
  author: string,
  fallbackSourceUrl: string,
) {
  if (!/MacArthur/i.test(`${title} ${author}`)) return 0;

  const comments = db.prepare(`
    SELECT destination.id AS destinationId,
           source_comment.id AS sourceCommentId,
           source_comment.text,
           COUNT(DISTINCT source_link.book_id) AS bookCount,
           MIN(source_link.book_id) AS bookId,
           COALESCE(NULLIF(MIN(source_link.source_url), ''), ?) AS sourceUrl
    FROM source.study_comment source_comment
    JOIN source.study_comment_link source_link ON source_link.comment_id = source_comment.id
    JOIN study_comments destination
      ON destination.source_id = ?
     AND destination.source_comment_id = source_comment.id
    GROUP BY source_comment.id, destination.id
  `).all(fallbackSourceUrl, sourceId) as Array<{
    destinationId: number;
    sourceCommentId: number;
    text: string;
    bookCount: number;
    bookId: number;
    sourceUrl: string;
  }>;
  const verses = db.prepare(`
    SELECT source_book.book_reference_id AS bookRefId, source_verse.chapter, source_verse.verse
    FROM source.verse source_verse
    JOIN source.book source_book ON source_book.id = source_verse.book_id
    WHERE source_verse.book_id = ?
      AND source_verse.chapter * 1000 + source_verse.verse BETWEEN ? AND ?
    ORDER BY source_verse.chapter, source_verse.verse
  `);
  const deleteLinks = db.prepare('DELETE FROM study_comment_links WHERE comment_id = ?');
  const insertLink = db.prepare(`
    INSERT INTO study_comment_links (comment_id, book_ref_id, chapter, verse, source_url)
    VALUES (?, ?, ?, ?, ?)
  `);
  const updateQuality = db.prepare(`
    UPDATE study_comments SET mapping_quality = 'leading-reference-exact' WHERE id = ?
  `);
  let refinedCount = 0;

  for (const comment of comments) {
    const reference = parseLeadingStudyReference(comment.text);
    if (!reference || comment.bookCount !== 1) continue;
    const mappedVerses = verses.all(
      comment.bookId,
      reference.startChapter * 1000 + reference.startVerse,
      reference.endChapter * 1000 + reference.endVerse,
    ) as Array<{ bookRefId: number; chapter: number; verse: number }>;
    if (mappedVerses.length === 0) continue;

    deleteLinks.run(comment.destinationId);
    for (const mappedVerse of mappedVerses) {
      insertLink.run(
        comment.destinationId,
        mappedVerse.bookRefId,
        mappedVerse.chapter,
        mappedVerse.verse,
        comment.sourceUrl,
      );
    }
    updateQuality.run(comment.destinationId);
    refinedCount += 1;
  }
  return refinedCount;
}

function importModule(db: DatabaseSync, modulePath: string) {
  db.prepare('ATTACH DATABASE ? AS source').run(modulePath);
  try {
    const metadata = readSourceMetadata(db);
    const sourceName = metadata.name || path.basename(modulePath, '.sqlite');
    const code = resolveTranslationCode(sourceName);

    if (db.prepare('SELECT 1 FROM translations WHERE code = ?').get(code)) {
      return code;
    }

    db.exec('BEGIN');
    const translationResult = db.prepare(`
      INSERT INTO translations (code, name, language_code, copyright, permissions)
      VALUES (?, ?, ?, ?, ?)
    `).run(code, sourceName, resolveLanguageCode(metadata), metadata.copyright ?? '', metadata.permissions ?? '');
    const translationId = Number(translationResult.lastInsertRowid);

    db.prepare(`
      INSERT OR IGNORE INTO books (ref_id, testament, position)
      SELECT book_reference_id, testament_reference_id, book_reference_id
      FROM source.book
      ORDER BY book_reference_id
    `).run();
    db.prepare(`
      INSERT INTO book_names (translation_id, book_ref_id, name)
      SELECT ?, book_reference_id, name FROM source.book
    `).run(translationId);
    db.prepare(`
      INSERT INTO verses (translation_id, book_ref_id, chapter, verse, text)
      SELECT ?, b.book_reference_id, v.chapter, v.verse, v.text
      FROM source.verse v
      JOIN source.book b ON b.id = v.book_id
      ORDER BY b.book_reference_id, v.chapter, v.verse
    `).run(translationId);
    db.exec('COMMIT');
    return code;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('DETACH DATABASE source');
  }
}

function importStudyModule(db: DatabaseSync, modulePath: string) {
  db.prepare('ATTACH DATABASE ? AS source').run(modulePath);
  try {
    const metadata = readStudyMetadata(db);
    const bibleMetadata = readSourceMetadata(db);
    const title = metadata.study_title || metadata.title || 'Studienkommentar';
    const author = metadata.study_author || metadata.author || '';
    const sourceName = bibleMetadata.name || 'Schlachter 2000';
    const translationCode = resolveTranslationCode(sourceName);
    const copyright = [
      metadata.copyright_original,
      metadata.copyright_german,
      metadata.copyright_bible,
    ].filter(Boolean).join('\n');
    const sourceLicense = readStudySourceValue(db, 'license');
    const usageNotice = metadata.usage_notice || metadata.rights || metadata.license || sourceLicense || '';
    const sourceUrl = metadata.source_url || metadata.source_pdf || metadata.source_notes || readStudySourceValue(db, 'source_url');
    const sourceQuality = readStudySourceValue(db, 'source_quality');
    const commentColumns = sourceColumnNames(db, 'study_comment');
    const linkColumns = sourceColumnNames(db, 'study_comment_link');
    const slug = slugify(`${title}-${author || translationCode}`);

    db.exec('BEGIN');
    const sourceResult = db.prepare(`
      INSERT INTO study_sources (
        slug, translation_code, language_code, title, author, copyright, usage_notice,
        scope, theological_profile, source_quality, source_url, mapping_warning
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      slug,
      translationCode,
      resolveLanguageCode(bibleMetadata),
      title,
      author,
      copyright || metadata.rights || metadata.license || sourceLicense || '',
      usageNotice,
      metadata.scope || '',
      metadata.theological_profile || '',
      sourceQuality,
      sourceUrl,
      metadata.mapping_warning || '',
    );
    const sourceId = Number(sourceResult.lastInsertRowid);

    db.prepare(`
      INSERT INTO study_comments (
        source_id, source_comment_id, heading, page, mapping_quality, text
      )
      SELECT ?, id,
             ${commentColumns.has('heading') ? "COALESCE(heading, '')" : "''"},
             ${commentColumns.has('page') ? 'page' : 'NULL'},
             ${commentColumns.has('mapping_quality') ? "COALESCE(mapping_quality, '')" : "''"},
             text
      FROM source.study_comment
      ORDER BY id
    `).run(sourceId);

    db.prepare(`
      INSERT INTO study_comment_links (comment_id, book_ref_id, chapter, verse, source_url)
      SELECT destination_comment.id, source_book.book_reference_id,
             source_link.chapter, source_link.verse,
             ${linkColumns.has('source_url') ? "COALESCE(source_link.source_url, '')" : '?'}
      FROM source.study_comment_link source_link
      JOIN source.book source_book ON source_book.id = source_link.book_id
      JOIN study_comments destination_comment
        ON destination_comment.source_id = ?
       AND destination_comment.source_comment_id = source_link.comment_id
      ORDER BY source_book.book_reference_id, source_link.chapter, source_link.verse
    `).run(...(linkColumns.has('source_url') ? [sourceId] : [sourceUrl, sourceId]));
    refineMacArthurStudyLinks(db, sourceId, title, author, sourceUrl);
    db.exec('COMMIT');
    return slug;
  } catch (error) {
    if (db.isTransaction) db.exec('ROLLBACK');
    throw error;
  } finally {
    db.exec('DETACH DATABASE source');
  }
}

async function rebuildDatabase(
  archivePath: string,
  databasePath: string,
  signature: string,
  studyArchivePath?: string,
  additionalArchivePaths: string[] = [],
) {
  await mkdir(path.dirname(databasePath), { recursive: true });
  const importPath = `${databasePath}.importing`;
  await rm(importPath, { force: true });
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'das-wort-'));

  try {
    const primaryModules = await extractModules(archivePath, tempDirectory, 'primary');
    const studyArchiveModules = studyArchivePath
      ? await extractModules(studyArchivePath, tempDirectory, 'study')
      : [];
    const additionalModules = (await Promise.all(
      additionalArchivePaths.map((additionalArchivePath, index) =>
        extractModules(additionalArchivePath, tempDirectory, `additional-${index}`)),
    )).flat();
    const allModules = [...primaryModules, ...studyArchiveModules, ...additionalModules]
      .map((modulePath) => ({ modulePath, kind: moduleKind(modulePath) }));
    const modules = allModules.filter(({ kind }) => kind === 'bible').map(({ modulePath }) => modulePath);
    const studyModules = allModules.filter(({ kind }) => kind === 'study').map(({ modulePath }) => modulePath);
    const db = new DatabaseSync(importPath);
    try {
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
      createSchema(db);
      const importedCodes: string[] = [];
      for (const modulePath of modules) {
        importedCodes.push(importModule(db, modulePath));
      }

      const importedStudySources: string[] = [];
      for (const modulePath of studyModules) {
        importedStudySources.push(importStudyModule(db, modulePath));
      }

      setMeta(db, 'source_signature', signature);
      setMeta(db, 'schema_version', DATABASE_SCHEMA_VERSION);
      setMeta(db, 'imported_translations', importedCodes.sort().join(','));
      setMeta(db, 'imported_study_sources', importedStudySources.sort().join(','));
      setMeta(db, 'import_complete', '1');
      db.exec('PRAGMA optimize; PRAGMA wal_checkpoint(TRUNCATE);');
    } finally {
      db.close();
    }

    await rm(databasePath, { force: true });
    await import('node:fs/promises').then(({ rename }) => rename(importPath, databasePath));
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
    await rm(importPath, { force: true });
  }
}

export async function openBibleDatabase(
  archivePath: string,
  databasePath: string,
  studyArchivePath?: string,
  additionalArchivePaths: string[] = [],
) {
  let bibleSignature: string | undefined;
  try {
    bibleSignature = await archiveSignature(archivePath);
  } catch {
    // An existing imported database can still be used when the archive was moved.
  }

  let studySignature: string | undefined;
  if (studyArchivePath) {
    try {
      studySignature = await archiveSignature(studyArchivePath);
    } catch {
      throw new Error(`Studienarchiv nicht gefunden: ${studyArchivePath}`);
    }
  }

  const additionalSignatures: string[] = [];
  for (const additionalArchivePath of additionalArchivePaths) {
    try {
      additionalSignatures.push(await archiveSignature(additionalArchivePath));
    } catch {
      throw new Error(`Zusätzliches Bibelarchiv nicht gefunden: ${additionalArchivePath}`);
    }
  }

  const signature = bibleSignature
    ? `${DATABASE_SCHEMA_VERSION}|bible:${bibleSignature}|study:${studySignature ?? 'none'}|additional:${additionalSignatures.join(',') || 'none'}`
    : undefined;

  let isCurrent = false;
  try {
    const existing = new DatabaseSync(databasePath, { readOnly: true });
    isCurrent =
      getMeta(existing, 'import_complete') === '1' &&
      getMeta(existing, 'schema_version') === DATABASE_SCHEMA_VERSION &&
      (!signature || getMeta(existing, 'source_signature') === signature);
    existing.close();
  } catch {
    isCurrent = false;
  }

  if (!isCurrent) {
    if (!signature) {
      throw new Error(`Bibelarchiv nicht gefunden: ${archivePath}`);
    }
    console.log('Bibelarchiv wird einmalig importiert …');
    await rebuildDatabase(
      archivePath,
      databasePath,
      signature,
      studyArchivePath,
      additionalArchivePaths,
    );
  }

  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA query_only = ON;');
  return db;
}
