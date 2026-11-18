'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../plugin/js/core/syntax.js');
const M = require('../plugin/js/core/model.js');
const { compile } = require('../plugin/js/core/compile.js');
const { table } = require('./helpers.js');

function words(query) {
  return query.columns.map((c) => c.fields.filter(M.isFieldFilled).map((f) => [f.text, f.flags.join('')]));
}

test('help example: range prefix, $ % # * operators and groups', () => {
  const { query, errors } = S.parse('8: ($שומר/%מצא) #(אכל/גנב/מכר) *(פקדון/אבידה)*');
  assert.deepEqual(errors, []);
  assert.deepEqual(query.proximity, { kind: 'range', n: 8 });
  assert.deepEqual(words(query), [
    [['שומר', 'ע'], ['מצא', 'ש']],
    [['אכל', 'ק'], ['גנב', 'ק'], ['מכר', 'ק']],
    [['פקדון', 'דמ'], ['אבידה', 'דמ']],
  ]);
});

test('distance tokens: [4:1] forward, [1:1-] any order, [4:2] keeps the minimum', () => {
  const a = S.parse('נר [4:1] שבת').query;
  assert.deepEqual(a.gaps[0], { max: 4, min: null, dir: 'forward' });
  const b = S.parse('חכמים [1:1-] תקנו').query;
  assert.equal(b.gaps[0].dir, 'both');
  assert.equal(b.gaps[0].max, 1);
  const c = S.parse('מנחת נדבה [30:30-] לבונה').query;
  assert.equal(c.gaps[0].max, null);
  assert.equal(c.gaps[1].max, 30);
  assert.equal(S.parse('נר [4:2] שבת').query.gaps[0].min, 2);
});

test('scope prefixes, negation, family, grammatical suffix', () => {
  const p = S.parse('פסקה: -בני ישראל <שבט> אכל#');
  assert.deepEqual(p.errors, []);
  assert.equal(p.query.proximity.kind, 'paragraph');
  assert.deepEqual(words(p.query), [[['בני', 'ל']], [['ישראל', '']], [['שבט', 'ה']], [['אכל', 'ס']]]);
});

test('unsupported pieces produce Hebrew errors instead of silent changes', () => {
  assert.ok(S.parse('{{צער בעלי חיים}} שבת').errors.length > 0);
  assert.ok(S.parse('{חיפוש1} שבת').errors.length > 0);
  assert.ok(S.parse('[3:1] שבת').errors.length > 0);
  assert.ok(S.parse('נר [x] שבת').errors.length > 0);
  assert.equal(S.parse('').query, null);
});

test('wildcards stay in the word and compile through the regex route', () => {
  const { query } = S.parse('מ?ה רבנו');
  const r = compile(query, {});
  assert.equal(r.route, 'regex');
  assert.equal(r.tab.query, '/מ[א-ת]ה רבנו/');
});

test('stringify writes the Bar-Ilan form the history list shows', () => {
  const q = table(
    [[['משה', 'ק'], ['אהרון', 'ק']], [['ויאמר']], [], [['לבונה', 'ל']]],
    { gaps: [{ max: 3, dir: 'both' }, null, { max: 5, dir: 'forward' }] }
  );
  assert.equal(S.stringify(q), '#(משה/אהרון) [3:3-] ויאמר [5:1] -לבונה');
  const r = table([[['א']], [['ב']]], { proximity: { kind: 'range', n: 10 } });
  assert.equal(S.stringify(r), '10: א ב');
  const mixed = table([[['משה', 'ק'], ['אהרן', 'ח']]]);
  assert.equal(S.stringify(mixed), '(#משה/!אהרן)');
});

test('round trip: parse(stringify(q)) compiles to the same request', () => {
  const samples = [
    table([[['משה', 'ק'], ['אהרון', 'ק']], [['ויאמר'], ['אמר']]], { gaps: [{ max: 3, dir: 'both' }] }),
    table([[['בני', 'ל']], [['ישראל', 'סח']]]),
    table([[['א', 'דמ']], [['ב', 'גא']], [['ג']]], { proximity: { kind: 'document' } }),
    table([[['נר']], [['שבת']]], { gaps: [{ max: 4, dir: 'forward' }] }),
  ];
  for (const q of samples) {
    const parsed = S.parse(S.stringify(q));
    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(compile(parsed.query, {}).params, compile(q, {}).params, S.stringify(q));
  }
});

test('fitToTable pads a parsed query to 4 × 4', () => {
  const fitted = M.fitToTable(S.parse('א ב').query);
  assert.equal(fitted.columns.length, 4);
  assert.equal(fitted.gaps.length, 3);
  assert.ok(fitted.columns.every((c) => c.fields.length === 4));
  assert.equal(M.fitsTable(S.parse('א ב ג ד ה').query), false);
});
