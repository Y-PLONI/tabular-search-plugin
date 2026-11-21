/*
 * Columns -> one Otzaria `/…/` regex. Used for Bar-Ilan wildcards and for
 * alternatives that carry different word options (each alternative gets its
 * own sub-pattern). search.query strips regex characters, so these run
 * through js/regex-search.js or the native search tab.
 *
 *   ?  exactly one letter      ~  at most one letter      *  any letters
 *   (ע/י/@)  one of the letters at this position, @ = nothing
 *
 * The engine caps a pattern at 300 characters; a line pattern gets an implicit
 * word boundary at both edges.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(
    isNode ? require('./model.js') : root.BIModel,
    isNode ? require('./wordregex.js') : root.BIWordRegex
  );
  if (isNode) module.exports = api;
  else root.BIRegex = api;
})(typeof self !== 'undefined' ? self : this, function (M, W) {
  'use strict';

  const LETTER = '[א-ת]';
  const GRAMMAR_PREFIX = '(?:[והבכלמש]{1,3})?';
  const GRAMMAR_SUFFIX = LETTER + '{0,3}';
  const MAX_PATTERN = 300;
  // Flags a wildcard word supports; plain words support every option of wordregex.js.
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

  function applyWildcardFlags(fragment, flags) {
    let out = fragment;
    if (flags.indexOf('ד') !== -1) out = LETTER + '*' + out;
    else if (flags.indexOf('ק') !== -1) out = GRAMMAR_PREFIX + out;
    if (flags.indexOf('מ') !== -1) out = out + LETTER + '*';
    else if (flags.indexOf('ס') !== -1) out = out + GRAMMAR_SUFFIX;
    return out;
  }

  /** Otzaria option names of a field's flags (Bar-Ilan letters and extras). */
  function optionsOf(flags) {
    const out = [];
    flags.forEach(function (flag) {
      const names = M.FLAGS[flag] ? M.FLAGS[flag].options : M.EXTRA_OPTIONS.indexOf(flag) !== -1 ? [flag] : [];
      names.forEach(function (n) { if (out.indexOf(n) === -1) out.push(n); });
    });
    return out;
  }

  /** Flags of a word that this regex cannot reproduce (reported, not applied). */
  function unsupportedFlags(word) {
    if (word.kind === 'pattern') {
      return word.flags.filter(function (f) { return REGEX_FLAGS.indexOf(f) === -1; });
    }
    return word.flags.filter(function (f) { return W.unsupportedOptions(optionsOf([f])).length > 0; });
  }

  /** Regex for one alternative, with its own options. */
  function wordFragment(word) {
    if (word.kind === 'pattern') return applyWildcardFlags(wordToRegex(word.text), word.flags);
    return W.wordPattern(M.normalizeWord(word.text), optionsOf(word.flags).filter(function (o) {
      return W.SUPPORTED.indexOf(o) !== -1;
    }));
  }

  /** A column = one or more alternatives, each with its own options. */
  function columnToRegex(words) {
    const parts = words.map(wordFragment);
    const unique = parts.filter(function (p, i) { return parts.indexOf(p) === i; });
    return unique.length === 1 ? unique[0] : '(?:' + unique.join('|') + ')';
  }

  function between(n) {
    // n = Bar-Ilan position distance; n-1 words may stand in between.
    if (n <= 1) return ' ';
    return '(?:\\s+\\S+){0,' + (n - 1) + '}\\s+';
  }

  function permutations(items) {
    if (items.length <= 1) return [items];
    const out = [];
    items.forEach(function (item, i) {
      const rest = items.slice(0, i).concat(items.slice(i + 1));
      permutations(rest).forEach(function (p) { out.push([item].concat(p)); });
    });
    return out;
  }

  /**
   * columns: [{ words: [{text, flags, kind}] }], gaps: [{n, dir}] between them,
   * proximity: TableQuery.proximity. Returns { regex, warnings }.
   * Any-order queries list the orders; with three columns or more each order
   * uses the largest distance (the exact pair distances are checked in js/core/verify.js).
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
        warnings.push({ code: 'regex-document', text: '≈ "בתוך מסמך" בחיפוש כביטוי רגולרי מחפש בתוך אותה פסקה.' });
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
    const widest = joiners.reduce(function (a, b) { return b.length > a.length ? b : a; });
    const orders = permutations(parts).map(function (p) { return p.join(widest); });
    const all = '(?:' + orders.join('|') + ')';
    if (all.length <= MAX_PATTERN) return { regex: '/' + all + '/', warnings };
    warnings.push({
      code: 'regex-order',
      text: '≈ בחיפוש כביטוי רגולרי עם שלושה מרכיבים ומעלה בסדר כלשהו הביטוי ארוך מדי – המרכיבים נחפשים לפי הסדר שהוקלד.',
    });
    return { regex: '/' + ordered + '/', warnings };
  }

  /** Characters between the slashes, as the engine counts them. */
  function patternLength(regex) {
    return Array.from(String(regex).replace(/^\/|\/$/g, '')).length;
  }

  return { wordToRegex, columnToRegex, wordFragment, buildRegex, unsupportedFlags, optionsOf, patternLength, REGEX_FLAGS, LETTER, MAX_PATTERN };
});
