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
    UPDATE translations SET language_code = 'en' WHERE code = 'ELB';
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
    INSERT INTO study_sources (id, slug, translation_code, title, author)
      VALUES (1, 'test-kommentar', 'LUT', 'Testkommentar', 'Ada Beispiel');
    UPDATE study_sources SET language_code = 'en' WHERE id = 1;
    INSERT INTO study_comments (id, source_id, source_comment_id, heading, page, text)
      VALUES (1, 1, 10, 'Zum Anfang', 12, 'Eine Studienanmerkung zum ersten Vers.');
    INSERT INTO study_comment_links (comment_id, book_ref_id, chapter, verse, source_url)
      VALUES (1, 1, 1, 1, 'https://example.test/comment');
  `);
  repository = new BibleRepository(database);
});

after(() => database.close());

test('lists translations and books', () => {
  const translations = repository.getTranslations();
  assert.equal(translations.length, 2);
  assert.equal(translations.find((translation) => translation.code === 'ELB')?.languageCode, 'en');
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
  assert.equal(passage?.translations[1].verses[0].commentCount, 1);
  assert.equal(passage?.translations[0].verses[0].commentCount, 1);
  assert.deepEqual(passage?.next ? { ...passage.next } : null, {
    bookId: 1,
    chapter: 2,
    bookName: '1. Mose',
  });
});

test('lists commentary sources and loads comments independently of the Bible translation', () => {
  const sources = repository.getCommentaries();
  assert.equal(sources.length, 1);
  assert.equal(sources[0].slug, 'test-kommentar');
  assert.equal(sources[0].languageCode, 'en');
  assert.equal(sources[0].verseLinkCount, 1);

  const comments = repository.getStudyComments(1, 1, 1);
  assert.equal(comments.length, 1);
  assert.equal(comments[0].sourceTitle, 'Testkommentar');
  assert.equal(comments[0].heading, 'Zum Anfang');
  assert.equal(comments[0].text, 'Eine Studienanmerkung zum ersten Vers.');
  assert.equal(repository.getChapterStudyComments(1, 1, 'test-kommentar')[0].verse, 1);
  assert.equal(repository.getStudyComments(1, 1, 2).length, 0);
});

test('finds verses containing all search terms', () => {
  const results = repository.search('Himmel Erde', 'LUT') as Array<{ bookName: string }>;
  assert.equal(results.length, 2);
  assert.equal(results[0].bookName, '1. Mose');
});
