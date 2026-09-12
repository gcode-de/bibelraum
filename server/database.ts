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
};

const DATABASE_SCHEMA_VERSION = '2';

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
      title TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      copyright TEXT NOT NULL DEFAULT '',
      usage_notice TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS study_comments (
      id INTEGER PRIMARY KEY,
      source_id INTEGER NOT NULL REFERENCES study_sources(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      UNIQUE (source_id, text)
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

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'studienkommentar';
}

function readSourceMetadata(db: DatabaseSync) {
  const rows = db.prepare('SELECT key, value FROM source.metadata').all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map(({ key, value }) => [key, value ?? '']));
}

function importModule(db: DatabaseSync, modulePath: string) {
  db.prepare('ATTACH DATABASE ? AS source').run(modulePath);
  try {
    const metadata = readSourceMetadata(db);
    const sourceName = metadata.name || path.basename(modulePath, '.sqlite');
    const code = translationCodes[sourceName] ?? sourceName.toUpperCase().replace(/[^A-Z0-9ÄÖÜ]/g, '');

    db.exec('BEGIN');
    const translationResult = db.prepare(`
      INSERT INTO translations (code, name, copyright, permissions)
      VALUES (?, ?, ?, ?)
    `).run(code, sourceName, metadata.copyright ?? '', metadata.permissions ?? '');
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
    const title = metadata.study_title || 'Studienkommentar';
    const sourceName = bibleMetadata.name || 'Schlachter 2000';
    const translationCode = translationCodes[sourceName] ?? 'SLT';
    const copyright = [
      metadata.copyright_original,
      metadata.copyright_german,
      metadata.copyright_bible,
    ].filter(Boolean).join('\n');

    db.exec('BEGIN');
    const sourceResult = db.prepare(`
      INSERT INTO study_sources (slug, translation_code, title, author, copyright, usage_notice)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      slugify(`${title}-${translationCode}`),
      translationCode,
      title,
      metadata.study_author ?? '',
      copyright,
      metadata.usage_notice ?? '',
    );
    const sourceId = Number(sourceResult.lastInsertRowid);

    db.prepare(`
      INSERT INTO study_comments (source_id, text)
      SELECT ?, text
      FROM source.study_comment
      ORDER BY id
    `).run(sourceId);

    db.prepare(`
      INSERT INTO study_comment_links (comment_id, book_ref_id, chapter, verse, source_url)
      SELECT destination_comment.id, source_book.book_reference_id,
             source_link.chapter, source_link.verse, source_link.source_url
      FROM source.study_comment_link source_link
      JOIN source.study_comment source_comment ON source_comment.id = source_link.comment_id
      JOIN source.book source_book ON source_book.id = source_link.book_id
      JOIN study_comments destination_comment
        ON destination_comment.source_id = ? AND destination_comment.text = source_comment.text
      ORDER BY source_book.book_reference_id, source_link.chapter, source_link.verse
    `).run(sourceId);
    db.exec('COMMIT');
    return slugify(`${title}-${translationCode}`);
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
) {
  await mkdir(path.dirname(databasePath), { recursive: true });
  const importPath = `${databasePath}.importing`;
  await rm(importPath, { force: true });
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'bibelraum-'));

  try {
    const modules = await extractModules(archivePath, tempDirectory, 'bible');
    const studyModules = studyArchivePath
      ? await extractModules(studyArchivePath, tempDirectory, 'study')
      : [];
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

  const signature = bibleSignature
    ? `${DATABASE_SCHEMA_VERSION}|bible:${bibleSignature}|study:${studySignature ?? 'none'}`
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
    await rebuildDatabase(archivePath, databasePath, signature, studyArchivePath);
  }

  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA query_only = ON;');
  return db;
}
