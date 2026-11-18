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
