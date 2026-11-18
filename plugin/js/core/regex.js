/*
 * Bar-Ilan wildcards -> an Otzaria `/…/` regex query (route B, native search tab).
 * search.query sanitises `* ? ( ) |`, so wildcards only work through
 * reader.openSearchTab, which runs a valid `/…/` query as a regex.
 *
 *   ?  exactly one letter      ~  at most one letter      *  any letters
 *   (ע/י/@)  one of the letters at this position, @ = nothing
 */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./model.js') : root.BIModel
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BIRegex = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  const LETTER = '[א-ת]';
  const GRAMMAR_PREFIX = '(?:[והבכלמש]{1,3})?';
  const GRAMMAR_SUFFIX = LETTER + '{0,3}';
  // Flags that have a regex form; the rest are reported as ignored.
  const REGEX_FLAGS = ['ק', 'ס', 'ד', 'מ'];

  function escapeChar(ch) {
    return /[.^$|+\[\]{}\\]/.test(ch) ? '\\' + ch : ch;
  }

  /** One field text (wildcards allowed) -> regex fragment. */
  function wordToRegex(text) {
    const word = M.normalizeWord(text);
    let out = '';
    let i = 0;
    while (i < word.length) {
      const ch = word[i];
      if (ch === '?') out += LETTER;
      else if (ch === '~') out += LETTER + '?';
      else if (ch === '*') out += LETTER + '*';
      else if (ch === '(') {
        const end = word.indexOf(')', i);
        if (end === -1) throw new Error('סוגריים לא סגורים במילה "' + word + '".');
        const options = word.slice(i + 1, end).split('/').map(function (opt) {
          return opt === '@' ? '' : opt.split('').map(singleCharToRegex).join('');
        });
        out += '(?:' + options.join('|') + ')';
        i = end + 1;
        continue;
      } else if (ch === ')' || ch === '/' || ch === '@') {
        throw new Error('התו "' + ch + '" מותר רק בתוך (א/ב) במילה "' + word + '".');
      } else out += escapeChar(ch);
      i++;
    }
    return out;
  }

  function singleCharToRegex(ch) {
    if (ch === '?') return LETTER;
    if (ch === '~') return LETTER + '?';
    if (ch === '*') return LETTER + '*';
    return escapeChar(ch);
  }

  function applyFlags(fragment, flags) {
    let out = fragment;
    if (flags.indexOf('ד') !== -1) out = LETTER + '*' + out;
    else if (flags.indexOf('ק') !== -1) out = GRAMMAR_PREFIX + out;
    if (flags.indexOf('מ') !== -1) out = out + LETTER + '*';
    else if (flags.indexOf('ס') !== -1) out = out + GRAMMAR_SUFFIX;
    return out;
  }

  /** A column = one or more alternatives, each with its own flags. */
  function columnToRegex(words) {
    const parts = words.map(function (w) { return applyFlags(wordToRegex(w.text), w.flags); });
    const unique = parts.filter(function (p, i) { return parts.indexOf(p) === i; });
    return unique.length === 1 ? unique[0] : '(?:' + unique.join('|') + ')';
  }

  function between(n) {
    // n = Bar-Ilan position distance; n-1 words may stand in between.
    if (n <= 1) return ' ';
    return '(?:\\s+\\S+){0,' + (n - 1) + '}\\s+';
  }

  /**
   * columns: [{ words: [{text, flags}] }], gaps: [{n, dir}] between them,
   * proximity: TableQuery.proximity. Returns { regex, warnings }.
   */
  function buildRegex(columns, gaps, proximity) {
    const warnings = [];
    const parts = columns.map(function (c) { return columnToRegex(c.words); });
    if (parts.length === 1) return { regex: '/' + parts[0] + '/', warnings };

    const kind = proximity.kind;
    let joiners;
    let anyOrder = false;
    if (kind === 'paragraph' || kind === 'document') {
      joiners = parts.slice(1).map(function () { return '\\s(?:.*\\s)?'; });
      anyOrder = true;
      if (kind === 'document') {
        warnings.push({ code: 'regex-document', text: '≈ "בתוך מסמך" בחיפוש עם תווים כלליים מחפש בתוך אותה פסקה.' });
      }
    } else if (kind === 'range' || kind === 'sentence') {
      const n = kind === 'range' ? proximity.n : M.SENTENCE_WINDOW;
      joiners = parts.slice(1).map(function () { return between(n); });
      anyOrder = true;
    } else {
      joiners = gaps.map(function (g) { return between(g.n); });
      anyOrder = gaps.some(function (g) { return g.dir === 'both' && g.n > 1; });
    }

    const ordered = parts.map(function (p, i) { return (i ? joiners[i - 1] : '') + p; }).join('');
    if (!anyOrder) return { regex: '/' + ordered + '/', warnings };
    if (parts.length === 2) {
      const reversed = parts[1] + joiners[0] + parts[0];
      return { regex: '/(?:' + ordered + '|' + reversed + ')/', warnings };
    }
    warnings.push({
      code: 'regex-order',
      text: '≈ בחיפוש עם תווים כלליים ובשלושה מרכיבים ומעלה המרכיבים נחפשים לפי הסדר שהוקלד.',
    });
    return { regex: '/' + ordered + '/', warnings };
  }

  return { wordToRegex, columnToRegex, buildRegex, REGEX_FLAGS, LETTER };
});
