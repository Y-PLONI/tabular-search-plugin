/*
 * TableQuery -> Otzaria request.
 *   route 'plugin': `params` for search.query (results inside the plugin)
 *   route 'regex' : `/…/` for wildcards, or for alternatives with their own
 *                   options (run by js/regex-search.js, or the tab)
 * Every result also carries `tab`, so any query can be reopened in Otzaria's
 * own search tab, and `warnings` describing each approximation. `verify`, when
 * set, holds exact conditions the engine cannot express (options per
 * alternative, a distance per pair in any order); js/core/verify.js applies
 * them to the result lines of a broader engine query.
 *
 * Distances: Bar-Ilan counts positions (empty/1 = adjacent, N = up to N-1
 * words in between); Otzaria counts words in between, hence the N-1 below.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(
    isNode ? require('./model.js') : root.BIModel,
    isNode ? require('./regex.js') : root.BIRegex,
    isNode ? require('./syntax.js') : root.BISyntax
  );
  if (isNode) module.exports = api;
  else root.BICompile = api;
})(typeof self !== 'undefined' ? self : this, function (M, R, S) {
  'use strict';

  const DEFAULT_PAGE_SIZE = 50;
  const TAB_EXCLUDED = ['order', 'limit', 'offset', 'grouping', 'includeBookCounts'];

  function warn(list, code, text) {
    if (!list.some(function (w) { return w.code === code; })) list.push({ code, text });
  }

  /** Expands families and normalises words; returns compiled columns. */
  function collectColumns(query, ctx, errors, warnings) {
    const families = (ctx && ctx.families) || {};
    const filled = M.filledColumnIndexes(query);
    return filled.map(function (colIndex, position) {
      const column = query.columns[colIndex];
      const label = 'מרכיב ' + (colIndex + 1);
      const words = [];
      let negated = false;
      let pattern = false;
      const flagSets = [];
      column.fields.forEach(function (field) {
        if (!M.isFieldFilled(field)) return;
        const flags = field.flags.slice();
        if (flags.indexOf('ל') !== -1) negated = true;
        if (flags.indexOf('פ') !== -1) {
          errors.push(label + ': ' + M.FLAGS['פ'].note);
        }
        const ownFlags = flags.filter(function (f) { return f !== 'ל' && f !== 'ה' && f !== 'פ'; });
        flagSets.push(ownFlags.slice().sort().join());
        if (flags.indexOf('ה') !== -1) {
          const name = M.normalizeWord(field.text).replace(/^<|>$/g, '');
          const members = families[name];
          if (!members || members.length === 0) {
            errors.push(label + ': המשפחה "' + name + '" לא נמצאה או ריקה (כפתור "משפחות").');
            return;
          }
          members.forEach(function (member) { addWord(member, ownFlags); });
          return;
        }
        addWord(field.text, ownFlags);
      });
      function addWord(text, flags) {
        const kind = M.classifyText(text);
        const word = M.normalizeWord(text);
        if (kind === 'invalid') {
          errors.push(label + ': "' + word + '" – כל שדה מכיל מילה אחת בלבד (בלי רווח או מקף).');
          return;
        }
        if (kind === 'pattern') pattern = true;
        if (words.some(function (w) { return w.text === word; })) return;
        words.push({ text: word, flags, kind });
      }
      const perField = flagSets.some(function (s) { return s !== flagSets[0]; });
      return { colIndex, position, words, negated, pattern, perField, label };
    });
  }

  /** Bar-Ilan property letters + extras of a column -> Otzaria option names. */
  function columnOptions(column, query, warnings) {
    const options = [];
    function add(name) { if (options.indexOf(name) === -1) options.push(name); }
    column.words.forEach(function (word) {
      word.flags.forEach(function (flag) {
        const def = M.FLAGS[flag];
        if (def) {
          def.options.forEach(add);
          if (def.status === 'approx') warn(warnings, 'flag-' + flag, '≈ ' + def.name + ': ' + def.note);
        } else if (M.EXTRA_OPTIONS.indexOf(flag) !== -1) {
          add(flag);
        }
      });
    });
    if (query.includeAcronyms) {
      add(M.ACRONYM_OPTION);
      warn(warnings, 'acronyms', '≈ כולל ראשי תיבות: אוצריא מרחיבה כשהמילה היא ראשי תיבות או הצירוף המלא שלהם.');
    }
    return options.sort();
  }

  function optionMap(names) {
    const map = {};
    names.forEach(function (name) { map[name] = true; });
    return map;
  }

  /** Bar-Ilan gap between two compiled columns, or across a negated one. */
  function effectiveGap(query, from, to) {
    const gap = M.gapBetween(query, from, to);
    const n = gap.max == null ? 1 : gap.max;
    return { n, dir: gap.max == null ? 'forward' : gap.dir, min: gap.min || null };
  }

  function mergeGaps(a, b) {
    return { n: a.n + b.n, dir: a.dir === 'both' || b.dir === 'both' ? 'both' : 'forward', min: null };
  }

  /** Gaps between consecutive entries of `cols` (compiled columns). */
  function gapsFor(query, all, cols) {
    const gaps = [];
    for (let i = 1; i < cols.length; i++) {
      let gap = null;
      for (let p = cols[i - 1].position; p < cols[i].position; p++) {
        const step = effectiveGap(query, all[p].colIndex, all[p + 1].colIndex);
        gap = gap ? mergeGaps(gap, step) : step;
      }
      gaps.push(gap);
    }
    return gaps;
  }

  /** Word-level part of a query: main words, alternatives, options. */
  function wordPart(cols, query, warnings) {
    const mains = cols.map(function (c) { return c.words[0].text; });
    const alternatives = {};
    cols.forEach(function (c, i) {
      const rest = c.words.slice(1).map(function (w) { return w.text; });
      if (rest.length) alternatives[String(i)] = rest;
    });
    const optionSets = cols.map(function (c) { return columnOptions(c, query, warnings); });
    const first = optionSets[0].join('|');
    const uniform = optionSets.every(function (s) { return s.join('|') === first; });
    const part = { query: mains.join(' '), alternatives, options: null, wordOptions: null };
    if (uniform) {
      if (optionSets[0].length) part.options = optionMap(optionSets[0]);
    } else {
      part.wordOptions = {};
      optionSets.forEach(function (set, i) {
        if (set.length) part.wordOptions[mains[i] + '_' + i] = optionMap(set);
      });
    }
    return part;
  }

  function spacingFromGaps(gaps) {
    const spacing = {};
    gaps.forEach(function (g, i) { spacing[i + '-' + (i + 1)] = String(g.n - 1); });
    return spacing;
  }

  function applyScope(target, ctx, query) {
    const scope = ctx && ctx.scope;
    if (query.searchAll || !scope) return;
    if (!scope.all && scope.categories && scope.categories.length) target.categories = scope.categories.slice();
    if (!scope.all && scope.books && scope.books.length) {
      target.books = scope.books.map(function (b) {
        const book = {};
        if (b.id != null) book.id = b.id;
        if (b.bookId) book.bookId = b.bookId;
        if (b.type) book.type = b.type;
        return book;
      });
    }
    if (scope.eras && scope.eras.length) target.eras = scope.eras.slice();
  }

  function pagingOf(ctx) {
    const paging = {
      order: (ctx && ctx.order) || 'catalogue',
      limit: (ctx && ctx.limit) || DEFAULT_PAGE_SIZE,
      offset: (ctx && ctx.offset) || 0,
    };
    if (ctx && ctx.includeBookCounts) paging.includeBookCounts = true;
    return paging;
  }

  function compilePlugin(query, ctx, all, errors, warnings) {
    const positive = all.filter(function (c) { return !c.negated; });
    const negated = all.filter(function (c) { return c.negated; });
    const params = {};
    const main = wordPart(positive, query, warnings);
    params.query = main.query;
    params.mode = 'advanced';
    if (Object.keys(main.alternatives).length) params.alternativeWords = main.alternatives;
    if (main.options) params.options = main.options;
    if (main.wordOptions && Object.keys(main.wordOptions).length) params.wordOptions = main.wordOptions;

    const kind = query.proximity.kind;
    const gaps = gapsFor(query, all, positive);
    let anyOrder = false;
    if (positive.length > 1) {
      if (kind === 'pairs') {
        if (gaps.some(function (g) { return g.min && g.min > 1; })) {
          warn(warnings, 'min-gap', '≈ מרחק מינימלי ([4:2]) אינו נתמך; החיפוש מתחיל ממילה צמודה.');
        }
        if (gaps.some(function (g) { return g.dir === 'both'; })) {
          // Otzaria allows one distance for all pairs; the largest one fetches a
          // superset, and verify.js checks each pair's own distance.
          anyOrder = true;
          const max = Math.max.apply(null, gaps.map(function (g) { return g.n; }));
          params.distance = max - 1;
          params.anyOrder = true;
        } else if (gaps.some(function (g) { return g.n > 1; })) {
          params.customSpacing = spacingFromGaps(gaps);
        }
      } else if (kind === 'range' || kind === 'sentence') {
        const n = kind === 'range' ? query.proximity.n : M.SENTENCE_WINDOW;
        params.distance = Math.max(0, n - 1);
        params.anyOrder = true;
        anyOrder = true;
        if (kind === 'range') {
          warn(warnings, 'range', '≈ טווח מילים: אוצריא בודקת את המרחק בין כל זוג מרכיבים סמוכים, לא את רוחב החלון כולו.');
        } else {
          warn(warnings, 'sentence', '≈ בתוך משפט: לאוצריא אין גבולות משפט; נחפש עד ' + (M.SENTENCE_WINDOW - 1) + ' מילים בין המרכיבים, בכל סדר.');
        }
      } else if (kind === 'paragraph') {
        params.proximityScope = 'sameParagraph';
      } else if (kind === 'document') {
        params.proximityScope = 'sameSection';
        warn(warnings, 'document', '≈ בתוך מסמך: באוצריא – תחת אותה כותרת (פרק, סימן).');
      }
    }

    if (negated.length) {
      const neg = negated[0];
      const members = all.filter(function (c) {
        return c === neg || (!c.negated && Math.abs(c.position - neg.position) === 1);
      });
      const part = wordPart(members, query, warnings);
      params.negativeQuery = part.query;
      if (Object.keys(part.alternatives).length) params.negativeAlternativeWords = part.alternatives;
      if (part.options) params.negativeOptions = part.options;
      if (part.wordOptions && Object.keys(part.wordOptions).length) params.negativeWordOptions = part.wordOptions;
      if (members.length > 1) {
        const negGaps = gapsFor(query, all, members);
        if (anyOrder) {
          params.negativeDistance = Math.max.apply(null, negGaps.map(function (g) { return g.n; })) - 1;
        } else {
          params.negativeCustomSpacing = spacingFromGaps(negGaps);
        }
      }
      warn(warnings, 'negation', '≈ שלילה: יוסתרו תוצאות שבהן מופיע "' + part.query + '".');
    }

    applyScope(params, ctx, query);
    Object.assign(params, pagingOf(ctx));

    const settings = {};
    Object.keys(params).forEach(function (key) {
      if (key !== 'query' && TAB_EXCLUDED.indexOf(key) === -1) settings[key] = params[key];
    });
    return { params, tab: { query: params.query, settings } };
  }

  function ignoredRegexFlags(all, query) {
    const ignored = [];
    all.forEach(function (c) {
      c.words.forEach(function (w) {
        R.unsupportedFlags(w).forEach(function (flag) {
          if (ignored.indexOf(flag) === -1) ignored.push(flag);
        });
      });
    });
    if (query.includeAcronyms) ignored.push(M.ACRONYM_OPTION);
    return ignored;
  }

  function compileRegex(query, ctx, all, errors, warnings) {
    if (all.some(function (c) { return c.negated; })) {
      errors.push('לא ניתן לשלב שלילת מרכיב (ל) עם תווים כלליים (? * ~ @).');
      return null;
    }
    const ignored = ignoredRegexFlags(all, query);
    if (ignored.length) {
      warn(warnings, 'regex-flags', '≈ בחיפוש כביטוי רגולרי לא יחולו: ' +
        ignored.map(M.flagLabel).join(', ') + '.');
    }
    warn(warnings, 'regex-route', REGEX_ROUTE_TEXT);
    let built;
    try {
      built = R.buildRegex(all, gapsFor(query, all, all), query.proximity);
    } catch (error) {
      errors.push(error.message);
      return null;
    }
    built.warnings.forEach(function (w) { warn(warnings, w.code, w.text); });
    regexLimits(built.regex, ctx, query, warnings);
    const settings = {};
    applyScope(settings, ctx, query);
    // Prepared for a host that accepts `/…/` in search.query; app.js decides the route.
    const params = Object.assign({ query: built.regex }, settings, pagingOf(ctx));
    return { params, tab: { query: built.regex, settings } };
  }

  // ── exact checks in the plugin (verify.js) ─────────────────────────────

  /** Pairs mode, three columns or more, any order, not one shared distance. */
  function needsPairCheck(query, gaps) {
    if (query.proximity.kind !== 'pairs' || gaps.length < 2) return false;
    if (!gaps.some(function (g) { return g.dir === 'both'; })) return false;
    const max = Math.max.apply(null, gaps.map(function (g) { return g.n; }));
    return gaps.some(function (g) { return g.n !== max || g.dir !== 'both'; });
  }

  /** Conditions verify.js checks on each line: per-alternative patterns and pair distances. */
  function verifySpec(query, all, positive) {
    const gaps = gapsFor(query, all, positive);
    const kind = query.proximity.kind;
    const window = kind === 'range' ? query.proximity.n : kind === 'sentence' ? M.SENTENCE_WINDOW : null;
    return {
      columns: positive.map(function (c) {
        const union = [];
        c.words.forEach(function (w) { w.flags.forEach(function (f) { if (union.indexOf(f) === -1) union.push(f); }); });
        const unionWords = c.words.map(function (w) { return { text: w.text, kind: w.kind, flags: union }; });
        const looseOk = !query.includeAcronyms && unionWords.every(function (w) { return R.unsupportedFlags(w).length === 0; });
        return {
          alts: c.words.map(function (w) {
            const checkable = R.unsupportedFlags(w).length === 0 && !query.includeAcronyms;
            return { pattern: checkable ? R.wordFragment(w) : null };
          }),
          loose: looseOk ? R.columnToRegex(unionWords) : null,
        };
      }),
      gaps: gaps.map(function (g) {
        if (kind === 'pairs') return { n: g.n, dir: g.dir };
        return { n: window || UNLIMITED, dir: 'both' };
      }),
    };
  }

  const UNLIMITED = 100000;
  const REGEX_ROUTE_TEXT = 'השאילתה כוללת תווים כלליים – היא תורץ כביטוי רגולרי.';
  const REGEX_MAX_PATTERN = 300;

  function regexLimits(regex, ctx, query, warnings) {
    if (regex.length - 2 > REGEX_MAX_PATTERN) {
      warn(warnings, 'regex-long', 'הביטוי ארוך מ-' + REGEX_MAX_PATTERN + ' תווים – הוא ייפתח בחיפוש של אוצריא.');
    }
    const scope = ctx && ctx.scope;
    if (!query.searchAll && scope && scope.eras && scope.eras.length) {
      warn(warnings, 'regex-eras', '≈ בחיפוש עם תווים כלליים בתוך התוסף אי אפשר לסנן לפי תקופות.');
    }
  }

  /** A raw `/…/` typed in the advanced line. */
  function compileRegexText(text, ctx, searchAll) {
    const regex = String(text || '').trim();
    const result = { ok: false, route: 'regex', params: null, tab: null, syntax: regex, errors: [], warnings: [] };
    if (!/^\/.+\/$/.test(regex)) {
      result.errors.push('ביטוי רגולרי נכתב בין שני לוכסנים: /…/');
      return result;
    }
    const query = { searchAll: !!searchAll };
    const settings = {};
    applyScope(settings, ctx, query);
    warn(result.warnings, 'regex-route', REGEX_ROUTE_TEXT);
    regexLimits(regex, ctx, query, result.warnings);
    result.ok = true;
    result.params = Object.assign({ query: regex }, settings, pagingOf(ctx));
    result.tab = { query: regex, settings };
    return result;
  }

  /**
   * compile(query, ctx) -> { ok, route, params, tab, syntax, errors, warnings }
   * ctx: { families, scope, order, limit, offset, includeBookCounts }
   */
  function compile(query, ctx) {
    const errors = [];
    const warnings = [];
    const all = collectColumns(query, ctx, errors, warnings);
    const result = {
      ok: false,
      route: 'plugin',
      params: null,
      tab: null,
      syntax: S.stringify(query),
      errors,
      warnings,
    };
    if (all.length === 0) {
      if (errors.length === 0) errors.push('יש להקליד לפחות מילה אחת.');
      return result;
    }
    all.forEach(function (c) {
      if (c.words.length === 0 && errors.length === 0) errors.push(c.label + ': אין מילים לחיפוש.');
    });
    const negatedCount = all.filter(function (c) { return c.negated; }).length;
    if (negatedCount > 1) errors.push('אפשר לשלול מרכיב אחד בלבד (ל).');
    if (negatedCount > 0 && negatedCount === all.length) {
      errors.push('יש לחפש לפחות מרכיב אחד שאינו שלול.');
    }
    if (errors.length) return result;

    const positive = all.filter(function (c) { return !c.negated; });
    const pairCheck = needsPairCheck(query, gapsFor(query, all, positive));
    const perField = all.some(function (c) { return c.perField; });
    const usesPattern = all.some(function (c) { return c.pattern; });
    let built = null;
    let checkFields = false;

    if (usesPattern) {
      result.route = 'regex';
      built = compileRegex(query, ctx, all, errors, warnings);
    } else if (perField) {
      // Alternatives with their own options: one regex with a sub-pattern per
      // alternative when it fits, otherwise a broader search checked here.
      const regexReady = !(ctx && ctx.noRegex) && !all.some(function (c) { return c.negated; }) &&
        ignoredRegexFlags(all, query).length === 0;
      if (regexReady) {
        const trial = [];
        const regex = compileRegex(query, ctx, all, [], trial);
        const fits = regex && R.patternLength(regex.tab.query) <= R.MAX_PATTERN &&
          !trial.some(function (w) { return w.code === 'regex-order'; });
        if (fits) {
          result.route = 'regex';
          built = regex;
          trial.filter(function (w) { return w.code !== 'regex-route'; }).forEach(function (w) { warn(warnings, w.code, w.text); });
          warn(warnings, 'per-alt-regex', PER_ALT_REGEX_TEXT);
        }
      }
      if (!built) {
        result.route = 'plugin';
        built = compilePlugin(query, ctx, all, errors, warnings);
        checkFields = true;
        warn(warnings, 'per-alt-check', PER_ALT_CHECK_TEXT);
        const unchecked = ignoredRegexFlags(all, query);
        if (unchecked.length) {
          warn(warnings, 'per-alt-unchecked', '≈ לפי חלופה לא נבדקים: ' + unchecked.map(M.flagLabel).join(', ') +
            ' (לחלופות אלה סומכים על הסימון של אוצריא).');
        }
      }
    } else {
      built = compilePlugin(query, ctx, all, errors, warnings);
    }
    if (!built || errors.length) return result;

    if (pairCheck) warn(warnings, 'pair-check', PAIR_CHECK_TEXT);
    result.ok = true;
    result.params = built.params;
    result.tab = built.tab;
    result.verify = pairCheck || checkFields ? verifySpec(query, all, positive) : null;
    return result;
  }

  const PER_ALT_REGEX_TEXT = 'לכל חלופה המאפיינים שלה: החיפוש רץ כביטוי רגולרי, עם תת-ביטוי נפרד לכל חלופה.';
  const PER_ALT_CHECK_TEXT = 'לכל חלופה המאפיינים שלה: אוצריא מחפשת עם כל המאפיינים של הטור, והתוסף משאיר רק שורות שבהן כל חלופה מתאימה למאפיינים שלה.';
  const PAIR_CHECK_TEXT = 'בסדר כלשהו (↔): אוצריא מחפשת לפי המרחק הגדול, והתוסף בודק לכל זוג את המרחק שלו, כמו בבר-אילן.';

  return { compile, compileRegexText, DEFAULT_PAGE_SIZE };
});
