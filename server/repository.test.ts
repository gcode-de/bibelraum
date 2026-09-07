import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createSchema } from './database.js';
import { BibleRepository } from './repository.js';

let database: DatabaseSync;
let repository: BibleRepository;

before(() => {
  database = new DatabaseSync(':memory:');
  createSchema(database);
  database.exec(`
    INSERT INTO translations (id, code, name) VALUES
      (1, 'LUT', 'Luther 2017'),
      (2, 'ELB', 'Elberfelder');
    INSERT INTO books (ref_id, testament, position) VALUES
      (1, 1, 1), (2, 1, 2);
    INSERT INTO book_names (translation_id, book_ref_id, name) VALUES
      (1, 1, '1. Mose'), (1, 2, '2. Mose'),
      (2, 1, '1. Mose'), (2, 2, '2. Mose');
    INSERT INTO verses (translation_id, book_ref_id, chapter, verse, text) VALUES
      (1, 1, 1, 1, 'Am Anfang schuf Gott Himmel und Erde.'),
      (1, 1, 2, 1, 'So wurden vollendet Himmel und Erde.'),
      (1, 2, 1, 1, 'Dies sind die Namen der Söhne Israels.'),
      (2, 1, 1, 1, 'Im Anfang schuf Gott die Himmel und die Erde.'),
      (2, 1, 2, 1, 'So wurden die Himmel und die Erde vollendet.');
  `);
  repository = new BibleRepository(database);
});

after(() => database.close());

test('lists translations and books', () => {
  assert.equal(repository.getTranslations().length, 2);
  assert.deepEqual({ ...repository.getBooks('LUT')[0] }, {
    id: 1,
    name: '1. Mose',
    testament: 1,
    chapters: 2,
  });
});

test('loads a passage in the requested translation order', () => {
  const passage = repository.getPassage(1, 1, ['ELB', 'LUT']);
  assert.equal(passage?.book.name, '1. Mose');
  assert.equal(passage?.translations[0].code, 'ELB');
  assert.equal(passage?.translations[1].verses[0].text, 'Am Anfang schuf Gott Himmel und Erde.');
  assert.deepEqual(passage?.next ? { ...passage.next } : null, {
    bookId: 1,
    chapter: 2,
    bookName: '1. Mose',
  });
});

test('finds verses containing all search terms', () => {
  const results = repository.search('Himmel Erde', 'LUT') as Array<{ bookName: string }>;
  assert.equal(results.length, 2);
  assert.equal(results[0].bookName, '1. Mose');
});
