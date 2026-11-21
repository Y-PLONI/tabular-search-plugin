/*
 * The other Bar-Ilan input forms -> TableQuery, so every form goes through
 * the same compiler.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(
    isNode ? require('./model.js') : root.BIModel,
    isNode ? require('./syntax.js') : root.BISyntax
  );
  if (isNode) module.exports = api;
  else root.BIForms = api;
})(typeof self !== 'undefined' ? self : this, function (M, S) {
  'use strict';

  /** Words of the easy form: split on spaces and on the Hebrew/Latin hyphen. */
  function easyWords(text) {
    return String(text || '').split(/[\s־-]+/).map(M.normalizeWord).filter(Boolean);
  }

  /**
   * חיפוש קל. opts: { withAdditions, prefixFirst, distance, plene }.
   * "מרחק של עד 2 מילים" = up to 2 words in between, in typed order (position 3).
   */
  function easyToQuery(text, opts) {
    const o = opts || {};
    const words = easyWords(text);
    const query = M.createEmptyQuery(Math.max(words.length, 1), 1);
    words.forEach(function (word, i) {
      const flags = [];
      if (o.withAdditions) {
        if (o.prefixFirst && i === 0) flags.push('ק');
        if (o.plene) flags.push('ח');
      }
      query.columns[i].fields[0] = M.createField(word, flags);
    });
    query.gaps.forEach(function (gap) {
      if (o.withAdditions && o.distance) {
        gap.max = 3;
        gap.dir = 'forward';
      }
    });
    return query;
  }

  /** חיפוש מתקדם: the syntax line -> { query, errors }. */
  function advancedToQuery(text) {
    return S.parse(text);
  }

  /** Question and function words dropped from a free-form question. */
  const FREE_STOPWORDS = ['האם', 'ומה', 'מה', 'מי', 'איך', 'כיצד', 'למה', 'מדוע', 'מתי', 'איפה', 'היכן',
    'יש', 'אין', 'של', 'את', 'על', 'אל', 'עם', 'אם', 'או', 'כי', 'גם', 'זה', 'זו', 'זאת', 'הוא', 'היא',
    'הם', 'הן', 'אני', 'אנו', 'אנחנו', 'אתה', 'את', 'לא', 'כן', 'כל', 'כמו', 'אבל', 'רק', 'עוד', 'אז',
    'שם', 'פה', 'כאן', 'בין', 'לפי', 'אחר', 'אחרי', 'לפני', 'מן', 'עד', 'ה', 'ו'];
  const FREE_FLAGS = ['ק', 'ח'];

  /**
   * חיפוש בניסוח חופשי: Otzaria has no meaning-based search, so the question
   * becomes an ordinary editable query: its content words (question words and
   * function words dropped), each with grammatical prefixes and plene/defective
   * spelling, all in the same paragraph. Returns null when no word is left.
   */
  function freeToQuery(text) {
    const words = String(text || '').replace(/[?!.,;:()"״־-]/g, ' ').split(/\s+/)
      .map(M.normalizeWord)
      .filter(function (w) { return w && FREE_STOPWORDS.indexOf(w) === -1 && M.classifyText(w) === 'word'; });
    const unique = words.filter(function (w, i) { return words.indexOf(w) === i; });
    if (!unique.length) return null;
    const query = M.createEmptyQuery(unique.length, 1);
    unique.forEach(function (word, i) {
      query.columns[i].fields[0] = M.createField(word, FREE_FLAGS);
    });
    query.proximity = { kind: unique.length > 1 ? 'paragraph' : 'pairs' };
    return query;
  }

  return { easyWords, easyToQuery, advancedToQuery, freeToQuery, FREE_STOPWORDS };
});
