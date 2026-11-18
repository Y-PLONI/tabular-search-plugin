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
