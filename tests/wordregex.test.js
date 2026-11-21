'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../plugin/js/core/wordregex.js');

function matcher(word, options) {
  return new RegExp('^(?:' + W.wordPattern(word, options) + ')$');
}

test('grammatical prefixes follow the engine: ו/מ/דא/כש/כ/ב/ש/ל/ה/ד, at most three, no short roots', () => {
  const re = matcher('שבת', ['קידומות דקדוקיות']);
  for (const w of ['שבת', 'ושבת', 'ובשבת', 'וכשהשבת', 'דאשבת']) assert.ok(re.test(w), w);
  for (const w of ['אשבת', 'שבתות', 'בית']) assert.ok(!re.test(w), w);
  assert.equal(W.wordPattern('לא', ['קידומות דקדוקיות']), 'לא', 'a two-letter root takes no grammatical prefix');
});

test('grammatical suffixes: final letters open, final ה becomes ת/ות', () => {
  const king = matcher('מלך', ['סיומות דקדוקיות']);
  for (const w of ['מלך', 'מלכים', 'מלכו', 'מלכותיהם']) assert.ok(king.test(w), w);
  assert.ok(!king.test('מלכא'));
  const torah = matcher('תורה', ['סיומות דקדוקיות']);
  for (const w of ['תורה', 'תורתו', 'תורות']) assert.ok(torah.test(w), w);
  assert.ok(!torah.test('תורהו'));
});

test('כתיב מלא/חסר: engine rules (no deletion before final ה, short words only ו after the first letter)', () => {
  assert.deepEqual(W.spellingVariations('כהן', 32), ['כהן', 'כוהן']);
  const mitzvot = W.spellingVariations('מצוות', 32);
  assert.ok(mitzvot.includes('מצות'));
  assert.ok(!mitzvot.includes('מצת'));
  assert.ok(!W.spellingVariations('מצוה', 32).includes('מצה'));
  const aharon = matcher('אהרן', ['כתיב מלא/חסר']);
  assert.ok(aharon.test('אהרון') && aharon.test('אהרן'));
});

test('arbitrary prefixes/suffixes are bounded windows; partial word; quotes; Aramaic', () => {
  assert.ok(matcher('נדר', ['קידומות']).test('אלכסנדר') === false, 'only up to 3 letters before');
  assert.ok(matcher('נדר', ['קידומות']).test('סטנדר'));
  assert.ok(matcher('נדב', ['סיומות']).test('נדבק'));
  assert.ok(matcher('שבת', ['חלק ממילה']).test('בשבתא'));
  assert.ok(matcher('רמב"ם', ['התעלם מגרשיים']).test('רמבם'));
  assert.ok(matcher('מלכה', ['סיומות ארמיות']).test('מלכא'));
});

test('options that need Otzaria dictionaries are reported, not imitated', () => {
  assert.deepEqual(W.unsupportedOptions(['קידומות דקדוקיות', 'תרגום ארמי', 'שגיאות כתיב']), ['תרגום ארמי', 'שגיאות כתיב']);
});
