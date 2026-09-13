import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const additionalArchivePaths = [
  process.env.EXTENDED_ARCHIVE,
  process.env.ENGLISH_ARCHIVE,
  ...(process.env.ADDITIONAL_ARCHIVES?.split(path.delimiter) ?? []),
].filter((archivePath): archivePath is string => Boolean(archivePath?.trim()))
  .map((archivePath) => path.resolve(archivePath));

export const config = {
  projectRoot,
  port: Number(process.env.PORT ?? 4174),
  archivePath: path.resolve(
    process.env.BIBLE_ARCHIVE ?? path.join(projectRoot, 'OpenLP-Bibeln-DE-2026-09-07.zip'),
  ),
  studyArchivePath: process.env.STUDY_ARCHIVE
    ? path.resolve(process.env.STUDY_ARCHIVE)
    : undefined,
  additionalArchivePaths,
  databasePath: path.resolve(
    process.env.BIBLE_DB ?? path.join(projectRoot, 'data', 'das-wort.sqlite'),
  ),
};
