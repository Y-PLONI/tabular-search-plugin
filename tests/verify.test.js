'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../plugin/js/core/verify.js');
const W = require('../plugin/js/core/wordregex.js');

const col = (...patterns) => ({ alts: patterns.map((p) => ({ pattern: p })) });

test('tokenize: tags, highlights, nikud, punctuation, <br>', () => {
  const tokens = V.tokenize('וַיֹּאמֶר <b>משה</b>, אל&quot;הים<br>(שבת)');
  assert.deepEqual(tokens.map((t) => t.word), ['ויאמר', 'משה', 'אל"הים', 'שבת']);
  assert.deepEqual(tokens.map((t) => t.highlighted), [false, true, false, false]);
});

test('pair distances in any order: each pair has its own limit (Bar-Ilan)', () => {
  // א–ב at most 2 positions apart (any order), ב–ג at most 6 after ב.
  const spec = { columns: [col('א'), col('ב'), col('ג')], gaps: [{ n: 2, dir: 'both' }, { n: 6, dir: 'forward' }] };
  const c = V.compile(spec);
  assert.equal(V.check('ב א x x x ג', c), true);
  assert.equal(V.check('א x x ב ג', c), false, 'א–ב are 3 apart');
  assert.equal(V.check('א ב x x x x x x ג', c), false, 'ב–ג are 7 apart');
  assert.equal(V.check('ג א ב', c), false, 'ג must come after ב');
  assert.equal(V.check('ב x א ג', c), true);
});

test('options per alternative: only the alternative that has them gets them', () => {
  const moshe = W.wordPattern('משה', ['קידומות דקדוקיות']);
  const aharon = W.wordPattern('אהרן', ['כתיב מלא/חסר']);
  // loose = what Otzaria searched (union of both alternatives' options).
  const loose = '(?:' + W.wordPattern('משה', ['קידומות דקדוקיות', 'כתיב מלא/חסר']) + '|' +
    W.wordPattern('אהרן', ['קידומות דקדוקיות', 'כתיב מלא/חסר']) + ')';
  const spec = { columns: [{ ...col(moshe, aharon), loose }, col('אמר')], gaps: [{ n: 3, dir: 'both' }] };
  const c = V.compile(spec);
  assert.equal(V.check('ולמשה אמר', c), true);
  assert.equal(V.check('אהרון אמר', c), true);
  assert.equal(V.check('ולאהרון אמר', c), false, 'prefix belongs to משה only');
  assert.equal(V.check('מושה אמר', c), false, 'plene belongs to אהרן only');
});

test('unknown columns keep the hit; unsupported options trust the engine highlight', () => {
  const c = V.compile({ columns: [col('א'), col('ב')], gaps: [{ n: 1, dir: 'forward' }] });
  assert.equal(V.check('א ג', c), null);
  const trust = V.compile({ columns: [{ alts: [{ pattern: null }] }, col('ב')], gaps: [{ n: 1, dir: 'forward' }] });
  assert.equal(V.check('<b>סליק</b> ב', trust), true);
  assert.equal(V.filterHits([{ text: 'א x ב' }, { text: 'א ב' }],
    { columns: [col('א'), col('ב')], gaps: [{ n: 1, dir: 'forward' }] }).length, 1);
});
