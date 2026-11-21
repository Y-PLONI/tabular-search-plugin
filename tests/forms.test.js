'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../plugin/js/core/forms.js');
const { compile } = require('../plugin/js/core/compile.js');

const PAGE = { order: 'catalogue', limit: 50, offset: 0 };

test('easy search with all additions (Bar-Ilan defaults: prefix + 2 words)', () => {
  const q = F.easyToQuery('נר חנוכה', { withAdditions: true, prefixFirst: true, distance: true });
  assert.deepEqual(compile(q, {}).params, {
    query: 'נר חנוכה',
    mode: 'advanced',
    wordOptions: { 'נר_0': { 'קידומות דקדוקיות': true } },
    customSpacing: { '0-1': '2' },
    ...PAGE,
  });
});

test('easy search without additions is a plain adjacent phrase', () => {
  const q = F.easyToQuery('ואהבת לרעך כמוך', { withAdditions: false, prefixFirst: true, distance: true, plene: true });
  assert.deepEqual(compile(q, {}).params, { query: 'ואהבת לרעך כמוך', mode: 'advanced', ...PAGE });
});

test('easy search: plene spelling on every word, hyphen splits words', () => {
  const q = F.easyToQuery('בית-דין', { withAdditions: true, plene: true });
  const p = compile(q, {}).params;
  assert.equal(p.query, 'בית דין');
  assert.deepEqual(p.options, { 'כתיב מלא/חסר': true });
  assert.equal(F.easyToQuery('   ', {}).columns[0].fields[0].text, '');
});

test('advanced form goes through the syntax parser', () => {
  const { query, errors } = F.advancedToQuery('10: #משה אהרן');
  assert.deepEqual(errors, []);
  const p = compile(query, {}).params;
  assert.equal(p.distance, 9);
  assert.equal(p.anyOrder, true);
});

test('free-form question becomes an editable query of its content words', () => {
  const q = F.freeToQuery('האם יש חיוב לתרום כליה לחולה מסוכן?');
  assert.deepEqual(q.columns.map((c) => c.fields[0].text), ['חיוב', 'לתרום', 'כליה', 'לחולה', 'מסוכן']);
  assert.deepEqual(q.columns[0].fields[0].flags, ['ק', 'ח']);
  assert.deepEqual(q.proximity, { kind: 'paragraph' });
  const p = compile(q, {}).params;
  assert.equal(p.proximityScope, 'sameParagraph');
  assert.deepEqual(p.options, { 'קידומות דקדוקיות': true, 'כתיב מלא/חסר': true });
  assert.equal(F.freeToQuery('מה זה?'), null);
  assert.deepEqual(F.freeToQuery('שבת').proximity, { kind: 'pairs' });
});
