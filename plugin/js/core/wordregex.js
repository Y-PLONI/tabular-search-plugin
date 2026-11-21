/*
 * Word options -> regex, ported from the Otzaria search engine
 * (otzaria_search_engine 7.2.0, rust/src/hebrew_query.rs: word_to_pattern,
 * affix_arms, suffix_sides, generate_spelling_variations). Used to give each
 * alternative of a column its own options inside one `/…/` query, and to
 * check result lines in the plugin. The syntax works in Rust regex and JS.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BIWordRegex = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const OPT = {
    prefix: 'קידומות',
    suffix: 'סיומות',
    gramPrefix: 'קידומות דקדוקיות',
    gramSuffix: 'סיומות דקדוקיות',
    spelling: 'כתיב מלא/חסר',
    partial: 'חלק ממילה',
    aramaicPrefix: 'קידומות ארמיות',
    aramaicSuffix: 'סיומות ארמיות',
    ignoreQuotes: 'התעלם מגרשיים',
  };
  /** Options this module reproduces exactly. Others (תרגום ארמי, שגיאות כתיב,
   *  ראשי תיבות, ניקוד, טעמים) need the engine's dictionaries. */
  const SUPPORTED = Object.keys(OPT).map(function (k) { return OPT[k]; });

  const GRAM_PREFIX_ALTS_A = ['ו', 'מ', 'דא', 'כש', 'כ', 'ב', 'ש', 'ל', 'ה', 'ד'];
  const GRAM_PREFIX_ALTS_B = ['כש', 'כ', 'ב', 'ש', 'ל', 'ה', 'ד'];
  const HE_ALTS = ['ה'];
  const ARAMAIC_PREFIX_ALTS_A = ['ו', 'מ', 'דא', 'א', 'כש', 'כ', 'ב', 'ש', 'ל', 'ה', 'ד'];
  const GRAM_SUFFIX_ALTS = ['ותי', 'ותיך', 'ותיו', 'ותיה', 'ותינו', 'ותיכם', 'ותיכן', 'ותיהם', 'ותיהן',
    'יות', 'יי', 'יך', 'יו', 'יה', 'יא', 'תא', 'ינו', 'יכם', 'יכן', 'יהם', 'יהן',
    'י', 'ך', 'ו', 'ה', 'נו', 'כם', 'כן', 'ם', 'ן', 'ים', 'ות'];
  const VERB_SUFFIX_ALTS = ['תי', 'ת', 'תם', 'תן'];
  const HE_STEM_ALTS = ['ות', 'ת'];
  const MIN_GRAM_ROOT_LETTERS = 3;
  const MAX_SPELLING_BRANCHES = 32;
  const MAX_GRAMMATICAL_SPELLING_BRANCHES = 16;
  const AFFIX_LETTER = '[א-תװ-ײ"\']';
  const NOTE_DIGITS = '[0-9]*';
  const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };

  function flagsOf(options) {
    const has = function (name) { return options.indexOf(name) !== -1; };
    return {
      prefix: has(OPT.prefix),
      suffix: has(OPT.suffix),
      gramPrefix: has(OPT.gramPrefix),
      gramSuffix: has(OPT.gramSuffix),
      spelling: has(OPT.spelling),
      partial: has(OPT.partial),
      aramaicPrefix: has(OPT.aramaicPrefix),
      aramaicSuffix: has(OPT.aramaicSuffix),
      ignoreQuotes: has(OPT.ignoreQuotes),
    };
  }

  function escapeRegex(s) {
    return s.replace(/[\\.+*?()|[\]{}^$]/g, '\\$&');
  }

  function alternation(parts) {
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0];
    return '(?:' + parts.join('|') + ')';
  }

  /** Same language as the engine's `(?:a|b|…)`, shorter: single letters become one class. */
  function altsGroup(alts) {
    const singles = alts.filter(function (a) { return a.length === 1; });
    const multi = alts.filter(function (a) { return a.length !== 1; });
    const parts = multi.slice();
    if (singles.length === 1) parts.push(singles[0]);
    else if (singles.length > 1) parts.push('[' + singles.join('') + ']');
    if (parts.length === 1 && parts[0].length === 1) return parts[0];
    if (parts.length === 1 && /^\[[^\]]+\]$/.test(parts[0])) return parts[0];
    return '(?:' + parts.join('|') + ')';
  }
  function optionalAltsGroup(alts) { return altsGroup(alts) + '?'; }
  function prefixGroup(first) {
    return optionalAltsGroup(first) + optionalAltsGroup(GRAM_PREFIX_ALTS_B) + optionalAltsGroup(HE_ALTS);
  }
  function affixWindow(min, max) { return AFFIX_LETTER + '{' + min + ',' + max + '}'; }

  function userPrefixWindow(n) { return n === 0 ? 0 : n === 1 ? 5 : n === 2 ? 4 : 3; }
  function userSuffixWindow(n) { return n === 0 ? 0 : n === 1 ? 7 : n === 2 ? 6 : 5; }
  function partialWindow(n) { return n <= 3 ? 3 : 2; }

  function takesVerbSuffixes(root, letters) {
    const last = root[root.length - 1];
    return letters >= 3 && letters <= 4 && !/['"]/.test(root) && last !== 'ה' && last !== 'ת';
  }

  function suffixSides(root, letters, window, gram) {
    if (window == null && !gram) return [[root, '']];
    let suffixes = GRAM_SUFFIX_ALTS.slice();
    if (takesVerbSuffixes(root, letters)) suffixes = suffixes.concat(VERB_SUFFIX_ALTS);
    const last = root[root.length - 1];
    if (FINALS[last]) {
      const stem = root.slice(0, -1) + FINALS[last];
      const required = [];
      if (window != null) required.push(affixWindow(1, window));
      if (gram) required.push(altsGroup(suffixes));
      return [[root, ''], [stem, alternation(required)]];
    }
    const win = window != null ? affixWindow(0, window) : null;
    if (last === 'ה' && gram) {
      return [[root, win || ''], [root.slice(0, -1), altsGroup(HE_STEM_ALTS) + optionalAltsGroup(suffixes)]];
    }
    const trails = win ? [win] : [];
    if (gram) trails.push(optionalAltsGroup(suffixes));
    return [[root, alternation(trails)]];
  }

  function affixArms(root, f) {
    const letters = root.length;
    if (!letters) return [];
    const abbreviation = /['"]/.test(root);
    const gramSuffix = f.gramSuffix && (abbreviation || letters >= MIN_GRAM_ROOT_LETTERS);
    const bothWindows = f.partial || (f.prefix && f.suffix);
    const leads = [];
    let trailWindow = null;
    if (bothWindows) {
      leads.push(NOTE_DIGITS + affixWindow(0, partialWindow(letters)));
      trailWindow = partialWindow(letters);
    } else {
      if (f.prefix) leads.push(NOTE_DIGITS + affixWindow(0, userPrefixWindow(letters)));
      if (f.suffix) trailWindow = userSuffixWindow(letters);
    }
    if (f.aramaicPrefix) leads.push(prefixGroup(ARAMAIC_PREFIX_ALTS_A));
    else if (f.gramPrefix && (abbreviation || letters >= MIN_GRAM_ROOT_LETTERS)) leads.push(prefixGroup(GRAM_PREFIX_ALTS_A));
    const lead = alternation(leads);
    const arms = [];
    suffixSides(root, letters, trailWindow, gramSuffix).forEach(function (side) {
      const key = lead + '\u0000' + side[0] + '\u0000' + side[1];
      if (!arms.some(function (a) { return a.key === key; })) arms.push({ key, lead, core: side[0], trail: side[1] });
    });
    return arms;
  }

  /** כתיב מלא/חסר variants, same rules and order as the engine. */
  function spellingVariations(word, limit) {
    if (!word) return [''];
    if (limit === 0) return [];
    const chars = Array.from(word);
    const n = chars.length;
    if (n >= 64) return [word];
    const letters = chars.filter(function (c) { return c !== "'" && c !== '"'; }).length;
    const edits = [];
    chars.forEach(function (c, i) {
      if (c === 'י' || c === 'ו') {
        if (i === 0 || chars[i - 1] !== c) {
          for (let j = i; j < n && chars[j] === c; j++) {
            if (j > 0 && j + 1 < n) {
              if (!(j + 2 === n && chars[n - 1] === 'ה')) edits.push({ del: j });
              break;
            }
          }
        }
      } else if (c === "'" || c === '"') edits.push({ del: i });
    });
    if (letters >= 4) {
      for (let gap = 1; gap < n; gap++) {
        edits.push({ ins: gap, letter: 'ו' });
        edits.push({ ins: gap, letter: 'י' });
      }
    } else if (letters === 3 && n === letters) {
      edits.push({ ins: 1, letter: 'ו' });
    }
    edits.length = Math.min(edits.length, 24);
    const m = edits.length;

    function valid(idx) {
      let yod = 0;
      let vav = 0;
      let deletedLetters = 0;
      const deleted = [];
      const gaps = [];
      const removed = [];
      const added = [];
      idx.forEach(function (i) {
        const e = edits[i];
        if (e.del != null) {
          deleted[e.del] = true;
          removed.push(chars[e.del]);
          if (chars[e.del] === 'י') yod++;
          if (chars[e.del] === 'ו') vav++;
          if (chars[e.del] !== "'" && chars[e.del] !== '"') deletedLetters++;
        } else {
          gaps.push(e.ins);
          added.push(e.letter);
          if (e.letter === 'י') yod++; else vav++;
        }
      });
      if (yod > 3 || vav > 3) return false;
      if (removed.some(function (c) { return added.indexOf(c) !== -1; })) return false;
      if (letters - deletedLetters < 3) return false;
      for (let k = 1; k < gaps.length; k++) {
        const g1 = gaps[k - 1];
        const g2 = gaps[k];
        if (g1 === g2) return false;
        let allDeleted = true;
        for (let p = g1; p < g2; p++) if (!deleted[p]) { allDeleted = false; break; }
        if (allDeleted) return false;
      }
      return true;
    }

    function apply(idx) {
      const deleted = [];
      const inserts = [];
      idx.forEach(function (i) {
        const e = edits[i];
        if (e.del != null) deleted[e.del] = true;
        else inserts.push(e);
      });
      let out = '';
      for (let i = 0; i <= n; i++) {
        inserts.forEach(function (e) { if (e.ins === i) out += e.letter; });
        if (i < n && !deleted[i]) out += chars[i];
      }
      return out;
    }

    const out = [word];
    const maxK = Math.min(m, 8);
    sizes: for (let k = 1; k <= maxK; k++) {
      if (out.length >= limit) break;
      const idx = [];
      for (let i = 0; i < k; i++) idx.push(i);
      for (;;) {
        if (valid(idx)) {
          const v = apply(idx);
          if (out.indexOf(v) === -1) out.push(v);
          if (out.length >= limit) break sizes;
        }
        let i = k;
        for (;;) {
          if (i === 0) continue sizes;
          i--;
          if (idx[i] < m - k + i) {
            idx[i]++;
            for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
            break;
          }
        }
      }
    }
    return out;
  }

  function aramaicVariants(word) {
    const swap = { 'ה': 'א', 'א': 'ה', 'ם': 'ן', 'ן': 'ם' }[word[word.length - 1]];
    return swap ? [word, word.slice(0, -1) + swap] : [word];
  }

  /**
   * Whole-word pattern for one word under Otzaria option names (unsupported
   * names are ignored; check them with unsupportedOptions first).
   */
  function wordPattern(word, options) {
    const f = flagsOf(options || []);
    let rootWord = String(word || '').replace(/״/g, '"').replace(/׳/g, "'");
    if (f.ignoreQuotes) rootWord = rootWord.replace(/['"]/g, '');
    const limit = f.gramPrefix || f.gramSuffix || f.aramaicPrefix ? MAX_GRAMMATICAL_SPELLING_BRANCHES : MAX_SPELLING_BRANCHES;
    const variants = f.aramaicSuffix ? aramaicVariants(rootWord) : [rootWord];
    const arms = [];
    variants.forEach(function (variant) {
      const forms = f.spelling ? spellingVariations(variant, limit) : [variant];
      forms.forEach(function (form) {
        affixArms(form, f).forEach(function (arm) {
          if (!arms.some(function (a) { return a.key === arm.key; })) arms.push(arm);
        });
      });
    });
    // All forms usually share one prefix group: factor it out once (same language).
    const byLead = [];
    arms.forEach(function (arm) {
      let group = byLead.find(function (g) { return g.lead === arm.lead; });
      if (!group) byLead.push(group = { lead: arm.lead, arms: [] });
      group.arms.push(arm);
    });
    const branches = [];
    byLead.forEach(function (g) {
      const bodies = g.arms.map(function (a) { return escapeRegex(a.core) + a.trail; });
      if (g.lead && bodies.length > 1) branches.push(g.lead + alternation(bodies));
      else bodies.forEach(function (b) { branches.push(g.lead + b); });
    });
    return alternation(branches);
  }

  function unsupportedOptions(options) {
    return (options || []).filter(function (o) { return SUPPORTED.indexOf(o) === -1; });
  }

  return { wordPattern, spellingVariations, unsupportedOptions, SUPPORTED, escapeRegex };
});
