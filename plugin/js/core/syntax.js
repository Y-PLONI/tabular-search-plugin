/*
 * Bar-Ilan "חיפוש מתקדם" syntax <-> TableQuery.
 * Bar-Ilan stores every tabular query in this syntax (see "שאילתות קודמות"),
 * so the same text is used for the history list and for the advanced view.
 *
 *   8: ($שומר/%מצא) #(אכל/גנב/מכר) *(פקדון/אבידה)*
 *   נר [4:1] שבת        – 2nd word at most 4 positions after the 1st
 *   חכמים [1:1-] תקנו   – also 1 position before (any order)
 *   פסקה: עגונה גוי      – same paragraph
 */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./model.js') : root.BIModel
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BISyntax = api;
})(typeof self !== 'undefined' ? self : this, function (M) {
  'use strict';

  /** Operator characters written before a word, in the order we emit them. */
  const PREFIX_OPS = { '-': 'ל', '#': 'ק', '*': 'ד', '!': 'ח', '+': 'ג', '$': 'ע', '%': 'ש', '^': 'א' };
  const SUFFIX_OPS = { '#': 'ס', '*': 'מ' };
  const FLAG_TO_PREFIX = { 'ק': '#', 'ד': '*', 'ח': '!', 'ג': '+', 'ע': '$', 'ש': '%', 'א': '^' };
  const FLAG_TO_SUFFIX = { 'ס': '#', 'מ': '*' };
  const SCOPE_WORDS = { 'משפט': 'sentence', 'פסקה': 'paragraph', 'מסמך': 'document' };
  const SCOPE_NAMES = { sentence: 'משפט', paragraph: 'פסקה', document: 'מסמך' };

  // ── stringify ────────────────────────────────────────────────────────────

  function fieldToken(field, ownFlags) {
    const flags = ownFlags || [];
    if (flags.indexOf('ה') !== -1) return '<' + M.normalizeWord(field.text) + '>';
    let prefix = '';
    Object.keys(FLAG_TO_PREFIX).forEach(function (flag) {
      if (flags.indexOf(flag) !== -1) prefix += FLAG_TO_PREFIX[flag];
    });
    let suffix = '';
    Object.keys(FLAG_TO_SUFFIX).forEach(function (flag) {
      if (flags.indexOf(flag) !== -1) suffix += FLAG_TO_SUFFIX[flag];
    });
    return prefix + M.normalizeWord(field.text) + suffix;
  }

  function sameFlags(a, b) {
    const x = a.filter(isSyntaxFlag).sort().join();
    const y = b.filter(isSyntaxFlag).sort().join();
    return x === y;
  }

  function isSyntaxFlag(flag) {
    return flag in FLAG_TO_PREFIX || flag in FLAG_TO_SUFFIX || flag === 'ה';
  }

  function columnToken(column) {
    const fields = column.fields.filter(M.isFieldFilled);
    const negated = fields.some(function (f) { return f.flags.indexOf('ל') !== -1; });
    const neg = negated ? '-' : '';
    if (fields.length === 1) return neg + fieldToken(fields[0], fields[0].flags);
    const uniform = fields.every(function (f) { return sameFlags(f.flags, fields[0].flags); });
    const hasFamily = fields.some(function (f) { return f.flags.indexOf('ה') !== -1; });
    if (uniform && !hasFamily) {
      const shared = fieldToken({ text: '\u0000' }, fields[0].flags).split('\u0000');
      const inner = fields.map(function (f) { return M.normalizeWord(f.text); }).join('/');
      return neg + shared[0] + '(' + inner + ')' + shared[1];
    }
    const inner = fields.map(function (f) { return fieldToken(f, f.flags); }).join('/');
    return neg + '(' + inner + ')';
  }

  function gapToken(gap) {
    if (!gap || gap.max == null) return '';
    if (gap.dir === 'forward') return '[' + gap.max + ':' + (gap.min || 1) + ']';
    return '[' + gap.max + ':' + gap.max + '-]';
  }

  /** TableQuery -> Bar-Ilan advanced syntax (empty columns are skipped). */
  function stringify(query) {
    const filled = M.filledColumnIndexes(query);
    if (filled.length === 0) return '';
    const parts = [];
    const kind = query.proximity && query.proximity.kind;
    filled.forEach(function (colIndex, i) {
      if (i > 0 && kind === 'pairs') {
        const gap = gapToken(M.gapBetween(query, filled[i - 1], colIndex));
        if (gap) parts.push(gap);
      }
      parts.push(columnToken(query.columns[colIndex]));
    });
    let prefix = '';
    if (kind === 'range') prefix = query.proximity.n + ': ';
    else if (SCOPE_NAMES[kind]) prefix = SCOPE_NAMES[kind] + ': ';
    return prefix + parts.join(' ');
  }

  // ── parse ────────────────────────────────────────────────────────────────

  function tokenize(text) {
    const tokens = [];
    let i = 0;
    const s = text;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (s.startsWith('{{', i)) {
        const end = s.indexOf('}}', i + 2);
        const stop = end === -1 ? s.length : end + 2;
        tokens.push({ type: 'phrase', text: s.slice(i + 2, end === -1 ? s.length : end) });
        i = stop;
        continue;
      }
      if (ch === '[') {
        const end = s.indexOf(']', i);
        const stop = end === -1 ? s.length : end + 1;
        tokens.push({ type: 'gap', text: s.slice(i + 1, end === -1 ? s.length : end) });
        i = stop;
        continue;
      }
      // A word token runs to the next space outside brackets of any kind.
      let depth = 0;
      let j = i;
      while (j < s.length) {
        const c = s[j];
        if (c === '(' || c === '<' || c === '{') depth++;
        else if (c === ')' || c === '>' || c === '}') depth = Math.max(0, depth - 1);
        else if (/\s/.test(c) && depth === 0) break;
        j++;
      }
      tokens.push({ type: 'word', text: s.slice(i, j).replace(/\s+/g, '') });
      i = j;
    }
    return tokens;
  }

  function parseGap(text, errors) {
    const m = /^\s*(\d+)\s*:\s*(-?)\s*(\d+)\s*(-?)\s*$/.exec(text);
    if (!m) {
      errors.push('מרחק לא תקין: [' + text + ']. הצורה: [4:1] או [4:4-].');
      return M.createGap();
    }
    const max = parseInt(m[1], 10);
    const other = parseInt(m[3], 10);
    const negative = m[2] === '-' || m[4] === '-';
    if (negative) return M.createGap(Math.max(max, other), 'both');
    const gap = M.createGap(max, 'forward');
    if (other > 1) gap.min = other;
    return gap;
  }

  function parseWordOps(raw) {
    const flags = [];
    let body = raw;
    // Prefix operators. '*' directly before a letter group is Bar-Ilan's "any prefix".
    while (body.length > 1 && Object.prototype.hasOwnProperty.call(PREFIX_OPS, body[0])) {
      const flag = PREFIX_OPS[body[0]];
      if (flags.indexOf(flag) === -1) flags.push(flag);
      body = body.slice(1);
    }
    while (body.length > 1 && Object.prototype.hasOwnProperty.call(SUFFIX_OPS, body[body.length - 1])) {
      const flag = SUFFIX_OPS[body[body.length - 1]];
      if (flags.indexOf(flag) === -1) flags.push(flag);
      body = body.slice(0, -1);
    }
    return { flags, body };
  }

  /** A word token whose body is one parenthesised group of alternatives. */
  function isAlternativeGroup(body) {
    if (body[0] !== '(' || body[body.length - 1] !== ')') return false;
    let depth = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i] === '(') depth++;
      else if (body[i] === ')') {
        depth--;
        if (depth === 0 && i !== body.length - 1) return false;
      }
    }
    return true;
  }

  function splitTopLevel(text) {
    const parts = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === '/' && depth === 0) {
        parts.push(text.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(text.slice(start));
    return parts;
  }

  function parseSingle(raw, outerFlags, errors) {
    const ops = parseWordOps(raw);
    const flags = outerFlags.slice();
    ops.flags.forEach(function (f) { if (flags.indexOf(f) === -1) flags.push(f); });
    let text = ops.body;
    if (/^<.*>$/.test(text)) {
      text = text.slice(1, -1);
      if (flags.indexOf('ה') === -1) flags.push('ה');
    } else if (/^\{.*\}$/.test(text)) {
      errors.push('חיפוש שמור כמרכיב ({' + text.slice(1, -1) + '}) אינו נתמך באוצריא.');
      text = text.slice(1, -1);
    }
    return M.createField(text, flags);
  }

  function parseColumn(raw, errors) {
    const ops = parseWordOps(raw);
    const column = { fields: [] };
    if (isAlternativeGroup(ops.body) && ops.body.indexOf('/') !== -1) {
      splitTopLevel(ops.body.slice(1, -1)).forEach(function (part) {
        if (part === '') return;
        column.fields.push(parseSingle(part, ops.flags, errors));
      });
    } else {
      column.fields.push(parseSingle(raw, [], errors));
    }
    // Negation is a column property: keep it on the main field only.
    const negated = column.fields.some(function (f) { return f.flags.indexOf('ל') !== -1; });
    column.fields.forEach(function (f, i) {
      f.flags = f.flags.filter(function (flag) { return flag !== 'ל'; });
      if (negated && i === 0) f.flags.unshift('ל');
    });
    return column;
  }

  /**
   * Bar-Ilan advanced syntax -> { query: TableQuery|null, errors: string[] }.
   * The query has as many columns as the text has components (not padded).
   */
  function parse(text) {
    const errors = [];
    let source = String(text || '').trim();
    const query = M.createEmptyQuery(1);
    query.columns = [];
    query.gaps = [];

    const head = /^(\d+|משפט|פסקה|מסמך)\s*:\s*/.exec(source);
    if (head) {
      if (/^\d+$/.test(head[1])) {
        const n = parseInt(head[1], 10);
        if (n < 1) errors.push('טווח המילים חייב להיות לפחות 1.');
        query.proximity = { kind: 'range', n: Math.max(1, n) };
      } else {
        query.proximity = { kind: SCOPE_WORDS[head[1]] };
      }
      source = source.slice(head[0].length);
    }

    let pendingGap = null;
    tokenize(source).forEach(function (token) {
      if (token.type === 'gap') {
        if (query.columns.length === 0) {
          errors.push('מרחק [' + token.text + '] חייב לבוא בין שתי מילים.');
          return;
        }
        pendingGap = parseGap(token.text, errors);
        return;
      }
      if (token.type === 'phrase') {
        errors.push('ביטוי של כמה מילים ({{' + token.text + '}}) אינו נתמך באוצריא. ' +
          'אפשר לסמן "כולל ראשי תיבות" או לחפש כל מילה במרכיב נפרד.');
        return;
      }
      if (query.columns.length > 0) {
        query.gaps.push(pendingGap || M.createGap());
        if (pendingGap && query.proximity.kind !== 'pairs') {
          errors.push('מרחקים בין זוגות [..] אינם מתיישבים עם "' + head[1] + ':".');
        }
      }
      pendingGap = null;
      query.columns.push(parseColumn(token.text, errors));
    });

    if (pendingGap) errors.push('מרחק בסוף השאילתה – חסרה מילה אחריו.');
    if (query.columns.length === 0) {
      return { query: null, errors: errors.length ? errors : ['יש להקליד לפחות מילה אחת.'] };
    }
    return { query, errors };
  }

  return { parse, stringify, tokenize };
});
