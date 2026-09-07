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

async function extractModules(archivePath: string, destination: string) {
  const archive = await unzipper.Open.file(archivePath);
  const modules = archive.files.filter(
    (entry) => entry.type === 'File' && entry.path.toLowerCase().endsWith('.sqlite'),
  );

  if (modules.length === 0) {
    throw new Error('Das Archiv enthält keine .sqlite-Bibelmodule.');
  }

  const extracted: string[] = [];
  for (const [index, entry] of modules.entries()) {
    const target = path.join(destination, `module-${index}.sqlite`);
    await pipeline(entry.stream(), createWriteStream(target));
    extracted.push(target);
  }
  return extracted;
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

async function rebuildDatabase(archivePath: string, databasePath: string, signature: string) {
  await mkdir(path.dirname(databasePath), { recursive: true });
  const importPath = `${databasePath}.importing`;
  await rm(importPath, { force: true });
  const tempDirectory = await mkdtemp(path.join(tmpdir(), 'bibelraum-'));

  try {
    const modules = await extractModules(archivePath, tempDirectory);
    const db = new DatabaseSync(importPath);
    try {
      db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
      createSchema(db);
      const importedCodes: string[] = [];
      for (const modulePath of modules) {
        importedCodes.push(importModule(db, modulePath));
      }

      setMeta(db, 'source_signature', signature);
      setMeta(db, 'imported_translations', importedCodes.sort().join(','));
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

export async function openBibleDatabase(archivePath: string, databasePath: string) {
  let signature: string | undefined;
  try {
    signature = await archiveSignature(archivePath);
  } catch {
    // An existing imported database can still be used when the archive was moved.
  }

  let isCurrent = false;
  try {
    const existing = new DatabaseSync(databasePath, { readOnly: true });
    isCurrent =
      getMeta(existing, 'import_complete') === '1' &&
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
    await rebuildDatabase(archivePath, databasePath, signature);
  }

  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA query_only = ON;');
  return db;
}
