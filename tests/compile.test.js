'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { compile } = require('../plugin/js/core/compile.js');
const { table } = require('./helpers.js');

const PAGE = { order: 'catalogue', limit: 50, offset: 0 };

test('Reference example #1: alternatives, per-column options, ↔ distance 3', () => {
  const q = table(
    [[['משה', 'ק'], ['אהרון', 'קח']], [['ויאמר'], ['אמר']]],
    { gaps: [{ max: 3, dir: 'both' }] }
  );
  const r = compile(q, {});
  assert.equal(r.ok, true, r.errors.join());
  assert.equal(r.route, 'plugin');
  assert.deepEqual(r.params, {
    query: 'משה ויאמר',
    mode: 'advanced',
    alternativeWords: { 0: ['אהרון'], 1: ['אמר'] },
    wordOptions: { 'משה_0': { 'קידומות דקדוקיות': true, 'כתיב מלא/חסר': true } },
    distance: 2,
    anyOrder: true,
    ...PAGE,
  });
  // Field-level flags differ inside column 1 -> documented approximation.
  assert.ok(r.warnings.some((w) => w.code === 'per-field'));
});

test('Reference example #2: same query in typed order uses customSpacing N-1', () => {
  const q = table(
    [[['משה', 'ק'], ['אהרון', 'קח']], [['ויאמר'], ['אמר']]],
    { gaps: [{ max: 3, dir: 'forward' }] }
  );
  const r = compile(q, {});
  assert.equal(r.params.distance, undefined);
  assert.equal(r.params.anyOrder, undefined);
  assert.deepEqual(r.params.customSpacing, { '0-1': '2' });
});

test('Reference example #3: negated column becomes a negative phrase with its neighbour', () => {
  const q = table([[['בני', 'ל']], [['ישראל']]]);
  const r = compile(q, {});
  assert.equal(r.ok, true, r.errors.join());
  assert.deepEqual(r.params, {
    query: 'ישראל',
    mode: 'advanced',
    negativeQuery: 'בני ישראל',
    negativeCustomSpacing: { '0-1': '0' },
    ...PAGE,
  });
  assert.ok(r.warnings.some((w) => w.code === 'negation'));
});

test('Reference example #4: בתוך פסקה with three columns', () => {
  const q = table([[['עגונה']], [['גוי']], [['עדות']]], { proximity: { kind: 'paragraph' } });
  const r = compile(q, {});
  assert.deepEqual(r.params, {
    query: 'עגונה גוי עדות',
    mode: 'advanced',
    proximityScope: 'sameParagraph',
    ...PAGE,
  });
});

test('Reference example #5: wildcard routes to the native tab as a regex with the scope', () => {
  const q = table([[['מ?ה']], [['רבנו']]], { searchAll: false });
  const r = compile(q, { scope: { categories: ['/תנך'] } });
  assert.equal(r.ok, true, r.errors.join());
  assert.equal(r.route, 'regex');
  assert.equal(r.params, null);
  assert.deepEqual(r.tab, { query: '/מ[א-ת]ה רבנו/', settings: { categories: ['/תנך'] } });
});

test('empty fields are adjacent and need no spacing', () => {
  const r = compile(table([[['ואהבת']], [['לרעך']], [['כמוך']]]), {});
  assert.deepEqual(r.params, { query: 'ואהבת לרעך כמוך', mode: 'advanced', ...PAGE });
});

test('ordered gaps: unfilled pair is explicit 0 when another pair has a number', () => {
  const r = compile(table([[['א']], [['ב']], [['ג']]], { gaps: [null, { max: 5, dir: 'forward' }] }), {});
  assert.deepEqual(r.params.customSpacing, { '0-1': '0', '1-2': '4' });
});

test('↔ with different distances uses the largest one and warns', () => {
  const q = table([[['א']], [['ב']], [['ג']]], {
    gaps: [{ max: 2, dir: 'both' }, { max: 6, dir: 'forward' }],
  });
  const r = compile(q, {});
  assert.equal(r.params.distance, 5);
  assert.equal(r.params.anyOrder, true);
  assert.equal(r.params.customSpacing, undefined);
  assert.ok(r.warnings.some((w) => w.code === 'uniform-max'));
});

test('anyOrder is never combined with customSpacing or a proximity scope', () => {
  const kinds = [{ kind: 'pairs' }, { kind: 'range', n: 7 }, { kind: 'sentence' },
    { kind: 'paragraph' }, { kind: 'document' }];
  for (const proximity of kinds) {
    const q = table([[['א']], [['ב', 'ל']], [['ג']]], {
      proximity,
      gaps: [{ max: 3, dir: 'both' }, { max: 4, dir: 'forward' }],
    });
    const p = compile(q, {}).params;
    if (p.anyOrder) {
      assert.equal(p.customSpacing, undefined, proximity.kind);
      assert.equal(p.negativeCustomSpacing, undefined, proximity.kind);
      assert.equal(p.proximityScope, undefined, proximity.kind);
    }
  }
});

test('range N -> anyOrder with N-1 words in between', () => {
  const r = compile(table([[['קטן']], [['שנולד']], [['גיגית']]], { proximity: { kind: 'range', n: 30 } }), {});
  assert.equal(r.params.distance, 29);
  assert.equal(r.params.anyOrder, true);
});

test('בתוך מסמך maps to sameSection', () => {
  const r = compile(table([[['א']], [['ב']]], { proximity: { kind: 'document' } }), {});
  assert.equal(r.params.proximityScope, 'sameSection');
});

test('identical options on every column use the global options map', () => {
  const r = compile(table([[['שבת', 'ק']], [['קודש', 'ק']]]), {});
  assert.deepEqual(r.params.options, { 'קידומות דקדוקיות': true });
  assert.equal(r.params.wordOptions, undefined);
});

test('gershayim are normalised before building word keys', () => {
  const r = compile(table([[['רמב״ם', 'ג']], [['הלכות']]]), {});
  assert.equal(r.params.query, 'רמב"ם הלכות');
  assert.deepEqual(r.params.wordOptions, { 'רמב"ם_0': { 'התעלם מגרשיים': true } });
});

test('empty middle column is skipped and its numbered gap is kept', () => {
  const q = table([[['א']], [], [['ג']]], { gaps: [null, { max: 4, dir: 'forward' }] });
  const r = compile(q, {});
  assert.equal(r.params.query, 'א ג');
  assert.deepEqual(r.params.customSpacing, { '0-1': '3' });
});

test('an alternative without a main word is promoted', () => {
  const q = table([[null, ['אהרן']], [['משה']]]);
  assert.equal(compile(q, {}).params.query, 'אהרן משה');
});

test('negated column in the middle: neighbours on both sides, positive gap merged', () => {
  const q = table([[['א']], [['ב', 'ל']], [['ג']]], {
    gaps: [{ max: 2, dir: 'forward' }, { max: 3, dir: 'forward' }],
  });
  const p = compile(q, {}).params;
  assert.equal(p.query, 'א ג');
  assert.deepEqual(p.customSpacing, { '0-1': '4' });
  assert.equal(p.negativeQuery, 'א ב ג');
  assert.deepEqual(p.negativeCustomSpacing, { '0-1': '1', '1-2': '2' });
});

test('validation: spaces, hyphens, two negations, only negation', () => {
  assert.equal(compile(table([[['בית דין']]]), {}).ok, false);
  assert.equal(compile(table([[['בית-דין']]]), {}).ok, false);
  assert.equal(compile(table([[['א', 'ל']], [['ב', 'ל']], [['ג']]]), {}).ok, false);
  assert.equal(compile(table([[['א', 'ל']]]), {}).ok, false);
  assert.equal(compile(table([]), {}).ok, false);
});

test('saved-search flag פ is rejected with an explanation', () => {
  const r = compile(table([[['שבת', 'פ']]]), {});
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /חיפוש/);
});

test('family flag expands the family into alternatives', () => {
  const r = compile(table([[['שבט', 'ה']], [['יהודה']]]), {
    families: { 'שבט': ['שבט', 'מטה', 'שבטי'] },
  });
  assert.equal(r.params.query, 'שבט יהודה');
  assert.deepEqual(r.params.alternativeWords, { 0: ['מטה', 'שבטי'] });
  assert.equal(compile(table([[['לא_קיים', 'ה']]]), {}).ok, false);
});

test('ערך / שורש are approximated by grammatical prefixes, suffixes and spelling', () => {
  const r = compile(table([[['שמר', 'ש']]]), {});
  assert.deepEqual(r.params.options, {
    'קידומות דקדוקיות': true, 'סיומות דקדוקיות': true, 'כתיב מלא/חסר': true,
  });
  assert.ok(r.warnings.some((w) => w.code === 'flag-ש'));
});

test('include acronyms adds ראשי תיבות to every column', () => {
  const r = compile(table([[['רמב"ם']], [['הלכות', 'ק']]], { includeAcronyms: true }), {});
  assert.deepEqual(r.params.wordOptions['רמב"ם_0'], { 'ראשי תיבות': true });
  assert.deepEqual(r.params.wordOptions['הלכות_1'], { 'ראשי תיבות': true, 'קידומות דקדוקיות': true });
});

test('scope is sent only when "search all" is off; tab settings drop paging keys', () => {
  const scope = { categories: ['/הלכה'], books: [{ id: 7, type: 'text', bookId: 'x' }], eras: ['ראשונים'] };
  const all = compile(table([[['שבת']]]), { scope });
  assert.equal(all.params.categories, undefined);
  const some = compile(table([[['שבת']]], { searchAll: false }), { scope, includeBookCounts: true, limit: 100 });
  assert.deepEqual(some.params.categories, ['/הלכה']);
  assert.deepEqual(some.params.books, [{ id: 7, bookId: 'x', type: 'text' }]);
  assert.deepEqual(some.params.eras, ['ראשונים']);
  assert.equal(some.params.includeBookCounts, true);
  assert.equal(some.params.limit, 100);
  assert.deepEqual(some.tab, {
    query: 'שבת',
    settings: { mode: 'advanced', categories: ['/הלכה'], books: [{ id: 7, bookId: 'x', type: 'text' }], eras: ['ראשונים'] },
  });
  // "בחר הכל" in the corpus dialog: only the era filter remains.
  const everything = compile(table([[['שבת']]], { searchAll: false }), { scope: { ...scope, all: true } });
  assert.equal(everything.params.categories, undefined);
  assert.equal(everything.params.books, undefined);
  assert.deepEqual(everything.params.eras, ['ראשונים']);
});

test('regex route: letter alternatives, ↔ for two columns, ignored flags', () => {
  const q = table([[['*(ט/ת)(א/ע/י/@)ל(ע/י/@)פ(א/ו)ן*']]]);
  assert.equal(compile(q, {}).tab.query, '/[א-ת]*(?:ט|ת)(?:א|ע|י|)ל(?:ע|י|)פ(?:א|ו)ן[א-ת]*/');
  const two = compile(table([[['נר', 'ח']], [['שב?']]], { gaps: [{ max: 3, dir: 'both' }] }), {});
  assert.equal(two.tab.query, '/(?:נר(?:\\s+\\S+){0,2}\\s+שב[א-ת]|שב[א-ת](?:\\s+\\S+){0,2}\\s+נר)/');
  assert.ok(two.warnings.some((w) => w.code === 'regex-flags'));
  assert.equal(compile(table([[['א', 'ל']], [['ב?']]]), {}).ok, false);
});
