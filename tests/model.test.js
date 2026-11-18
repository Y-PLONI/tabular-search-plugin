'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../plugin/js/core/model.js');

test('normalizeWord: Hebrew gershayim/geresh, doubled geresh, edge quotes', () => {
  assert.equal(M.normalizeWord(' רמב״ם '), 'רמב"ם');
  assert.equal(M.normalizeWord("תוס׳"), "תוס'");
  assert.equal(M.normalizeWord("רמב''ם"), 'רמב"ם');
  assert.equal(M.normalizeWord('"שלום"'), 'שלום');
});

test('classifyText', () => {
  assert.equal(M.classifyText(''), 'empty');
  assert.equal(M.classifyText('שָׁלוֹם'), 'word');
  assert.equal(M.classifyText('רמב"ם'), 'word');
  assert.equal(M.classifyText('בית דין'), 'invalid');
  assert.equal(M.classifyText('בית-דין'), 'invalid');
  assert.equal(M.classifyText('בית־דין'), 'invalid');
  assert.equal(M.classifyText('מ?ה'), 'pattern');
  assert.equal(M.classifyText('(ס/ש)מר'), 'pattern');
  assert.equal(M.classifyText('a.b'), 'invalid');
});

test('toggleFlag and ללא אפיון', () => {
  const field = M.createField('שבת');
  M.toggleFlag(field, 'ק');
  M.toggleFlag(field, 'ח');
  assert.deepEqual(field.flags, ['ק', 'ח']);
  M.toggleFlag(field, 'ק');
  assert.deepEqual(field.flags, ['ח']);
  M.toggleFlag(field, '');
  assert.deepEqual(field.flags, []);
});

test('upgradeQuery repairs foreign or partial state', () => {
  assert.equal(M.upgradeQuery(null).columns.length, 4);
  const q = M.upgradeQuery({
    columns: [{ fields: [{ text: 'א', flags: ['ק', 'zz'] }] }, { fields: [] }],
    gaps: [{ max: -3, dir: 'forward' }],
    proximity: { kind: 'range', n: 'x' },
  });
  assert.deepEqual(q.columns[0].fields[0].flags, ['ק']);
  assert.equal(q.gaps[0].max, null);
  assert.deepEqual(q.proximity, { kind: 'range', n: 5 });
});

test('flag grid lists every Bar-Ilan letter exactly once', () => {
  const letters = M.FLAG_GRID.flat().filter((x) => x);
  assert.deepEqual(letters.slice().sort(), Object.keys(M.FLAGS).sort());
});

test('nextCell follows Bar-Ilan order: row by row, stops at the ends', () => {
  assert.deepEqual(M.nextCell(0, 0, 1), { col: 1, row: 0 });
  assert.deepEqual(M.nextCell(3, 0, 1), { col: 0, row: 1 });
  assert.deepEqual(M.nextCell(0, 1, -1), { col: 3, row: 0 });
  assert.equal(M.nextCell(3, 3, 1), null);
  assert.equal(M.nextCell(0, 0, -1), null);
});

test('pasting several words fills the following cells, one word each', () => {
  const q = M.createEmptyQuery();
  const words = M.splitWords('  ואהבת   לרעך\nכמוך ');
  assert.deepEqual(words, ['ואהבת', 'לרעך', 'כמוך']);
  const r = M.distributeWords(q, 1, 0, words);
  assert.deepEqual(q.columns.map((c) => c.fields[0].text), ['', 'ואהבת', 'לרעך', 'כמוך']);
  assert.deepEqual(r, { last: { col: 3, row: 0 }, dropped: 0 });
  const tail = M.distributeWords(q, 2, 3, ['א', 'ב', 'ג']);
  assert.deepEqual(tail, { last: { col: 3, row: 3 }, dropped: 1 });
  // A hyphen keeps the word together; the compiler then reports it (one engine word per field).
  assert.deepEqual(M.splitWords('בית-דין שבת'), ['בית-דין', 'שבת']);
  assert.equal(M.classifyText('בית-דין'), 'invalid');
});

test('every filled cell holds exactly one word', () => {
  const q = M.createEmptyQuery();
  M.distributeWords(q, 0, 0, M.splitWords('a b c d e f g h i j k l m n o p q'));
  q.columns.forEach((c) => c.fields.forEach((f) => assert.equal(M.splitWords(f.text).length, 1)));
});
