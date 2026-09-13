import express from 'express';
import path from 'node:path';
import type { BibleRepository } from './repository.js';

function positiveInteger(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function createApp(repository: BibleRepository, staticDirectory?: string) {
  const app = express();
  app.disable('x-powered-by');

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/api/translations', (_request, response) => {
    response.json(repository.getTranslations());
  });

  app.get('/api/commentaries', (_request, response) => {
    response.json(repository.getCommentaries());
  });

  app.get('/api/books', (request, response) => {
    const translation = String(request.query.translation ?? 'LUT').toUpperCase();
    const books = repository.getBooks(translation);
    if (books.length === 0) {
      response.status(404).json({ error: 'Übersetzung nicht gefunden.' });
      return;
    }
    response.json(books);
  });

  app.get('/api/passage/:bookId/:chapter', (request, response) => {
    const bookId = positiveInteger(request.params.bookId);
    const chapter = positiveInteger(request.params.chapter);
    const translations = String(request.query.translations ?? 'LUT')
      .split(',')
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 4);

    if (!bookId || !chapter || translations.length === 0) {
      response.status(400).json({ error: 'Ungültige Stellenangabe.' });
      return;
    }

    const passage = repository.getPassage(bookId, chapter, translations);
    if (!passage) {
      response.status(404).json({ error: 'Bibelstelle nicht gefunden.' });
      return;
    }
    response.json(passage);
  });

  app.get('/api/comments/:bookId/:chapter/:verse', (request, response) => {
    const bookId = positiveInteger(request.params.bookId);
    const chapter = positiveInteger(request.params.chapter);
    const verse = positiveInteger(request.params.verse);
    const source = String(request.query.source ?? '').trim() || undefined;

    if (!bookId || !chapter || !verse) {
      response.status(400).json({ error: 'Ungültige Stellenangabe.' });
      return;
    }

    response.json(repository.getStudyComments(bookId, chapter, verse, source));
  });

  app.get('/api/comments/:bookId/:chapter', (request, response) => {
    const bookId = positiveInteger(request.params.bookId);
    const chapter = positiveInteger(request.params.chapter);
    const source = String(request.query.source ?? '').trim();

    if (!bookId || !chapter || !source) {
      response.status(400).json({ error: 'Ungültige Kommentaranfrage.' });
      return;
    }

    response.json(repository.getChapterStudyComments(bookId, chapter, source));
  });

  app.get('/api/search', (request, response) => {
    const query = String(request.query.q ?? '').trim();
    const translation = String(request.query.translation ?? 'LUT').toUpperCase();
    if (query.length < 2) {
      response.status(400).json({ error: 'Bitte mindestens zwei Zeichen eingeben.' });
      return;
    }
    response.json(repository.search(query, translation));
  });

  if (staticDirectory) {
    app.use(express.static(staticDirectory));
    app.get(/.*/, (_request, response) => response.sendFile(path.join(staticDirectory, 'index.html')));
  }

  app.use((_request, response) => response.status(404).json({ error: 'Nicht gefunden.' }));
  return app;
}
