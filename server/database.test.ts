import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLeadingStudyReference } from './database.js';

test('parses exact and ranged leading study references', () => {
  assert.deepEqual(parseLeadingStudyReference('3, 16: Denn also hat Gott die Welt geliebt.'), {
    startChapter: 3,
    startVerse: 16,
    endChapter: 3,
    endVerse: 16,
  });
  assert.deepEqual(parseLeadingStudyReference('7, 1 - 10, 36: Überblick'), {
    startChapter: 7,
    startVerse: 1,
    endChapter: 10,
    endVerse: 36,
  });
  assert.deepEqual(parseLeadingStudyReference('3, 16-18: Abschnitt'), {
    startChapter: 3,
    startVerse: 16,
    endChapter: 3,
    endVerse: 18,
  });
});

test('rejects ambiguous or reversed study references', () => {
  assert.equal(parseLeadingStudyReference('Kapitel 3 behandelt Nikodemus.'), null);
  assert.equal(parseLeadingStudyReference('4, 3 - 3, 16: Ungültiger Bereich'), null);
});
