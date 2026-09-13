import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  projectRoot,
  port: Number(process.env.PORT ?? 4174),
  archivePath: path.resolve(
    process.env.BIBLE_ARCHIVE ?? path.join(projectRoot, 'OpenLP-Bibeln-DE-2026-09-07.zip'),
  ),
  studyArchivePath: process.env.STUDY_ARCHIVE
    ? path.resolve(process.env.STUDY_ARCHIVE)
    : undefined,
  databasePath: path.resolve(
    process.env.BIBLE_DB ?? path.join(projectRoot, 'data', 'das-wort.sqlite'),
  ),
};
