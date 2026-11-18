'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const RS = require('../plugin/js/regex-search.js');
const { compileRegexText } = require('../plugin/js/core/compile.js');

const rows = [
  { type: 'text', book: 'בראשית', text: 'a', index: 0 },
  { type: 'text', book: 'ברכות', text: 'b', index: 4 },
  { type: 'pdf', book: 'ברכות', text: 'c', index: 2 },
];
const cats = { 'בראשית': '/תנך/תורה', 'ברכות': '/תלמוד בבלי' };
const categoryOf = (b) => (b.type === 'text' ? cats[b.bookId] : null);

test('rows become hits with category and a line reference', () => {
  const hit = RS.toHit(rows[1], categoryOf);
  assert.equal(hit.categoryPath, '/תלמוד בבלי');
  assert.equal(hit.reference, 'ברכות · שורה 5');
  assert.equal(hit.bookId, 'ברכות');
});

test('client-side corpus filter by category and by book', () => {
  const hits = rows.map((r) => RS.toHit(r, categoryOf));
  assert.equal(RS.filterHits(hits, { all: true }).length, 3);
  assert.deepEqual(RS.filterHits(hits, { all: false, categories: ['/תנך'] }).map((h) => h.book), ['בראשית']);
  assert.deepEqual(RS.filterHits(hits, { all: false, books: [{ bookId: 'ברכות', type: 'pdf' }] }).map((h) => h.type), ['pdf']);
  assert.deepEqual(RS.countByBook(hits).map((b) => b.count), [1, 1, 1]);
});

test('runRegexSearch: success, capped flag, scope filter', async () => {
  const host = { call: async () => rows };
  const r = await RS.runRegexSearch('/בר.*/', { host, scope: { all: false, categories: ['/תלמוד בבלי'] }, categoryOf });
  assert.equal(r.total, 1);
  assert.equal(r.capped, false);
});

test('runRegexSearch throws RegexSearchUnavailable so the caller can fall back', async () => {
  const failing = { call: async () => { const e = new Error('nope'); e.code = 'error.forbidden'; throw e; } };
  await assert.rejects(RS.runRegexSearch('/x/', { host: failing }), (e) => e instanceof RS.RegexSearchUnavailable && e.reason === 'error.forbidden');
  await assert.rejects(RS.runRegexSearch('/' + 'א'.repeat(301) + '/', { host: { call: async () => [] } }), /pattern-too-long/);
  await assert.rejects(RS.runRegexSearch('/x/', { host: { call: async () => null } }), /unexpected/);
});

test('raw /…/ from the advanced line keeps the scope for both routes', () => {
  const r = compileRegexText('/שב[א-ת]ת/', { scope: { all: false, categories: ['/הלכה'], books: [], eras: [] } }, false);
  assert.equal(r.ok, true);
  assert.deepEqual(r.tab, { query: '/שב[א-ת]ת/', settings: { categories: ['/הלכה'] } });
  assert.equal(r.params.query, '/שב[א-ת]ת/');
  assert.equal(compileRegexText('שבת', {}, false).ok, false);
});
