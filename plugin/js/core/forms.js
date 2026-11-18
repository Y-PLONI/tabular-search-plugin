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

  return { easyWords, easyToQuery, advancedToQuery };
});
