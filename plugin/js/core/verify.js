/*
 * Exact checks the engine cannot express, run on each result line:
 *  - every alternative with its own word options (Bar-Ilan: properties per field)
 *  - a distance per column pair also in any order (Otzaria: one distance for all)
 * The engine query is a superset (union of options, largest distance); this
 * keeps the lines that satisfy the exact Bar-Ilan conditions.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BIVerify = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MARKS = /[֑-ֽֿ-ׇ]/g;
  const ENTITIES = { '&quot;': '"', '&#39;': "'", '&apos;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };

  /**
   * Result text (HTML with <b>/<mark> highlights, <br> between lines) ->
   * [{ word, highlighted }] in reading order.
   */
  function tokenize(html) {
    const tokens = [];
    let depth = 0;
    let current = '';
    let currentHighlighted = false;
    function flush() {
      const word = cleanWord(current);
      if (word) tokens.push({ word, highlighted: currentHighlighted });
      current = '';
      currentHighlighted = false;
    }
    const parts = String(html || '').split(/(<[^>]*>)/);
    parts.forEach(function (part) {
      if (part[0] === '<') {
        const tag = /^<\s*(\/?)\s*([a-zA-Z]+)/.exec(part);
        if (!tag) return;
        const name = tag[2].toLowerCase();
        if (name === 'br' || name === 'p' || name === 'div') flush();
        else if (name === 'b' || name === 'strong' || name === 'mark') depth += tag[1] ? -1 : 1;
        return;
      }
      const text = part.replace(/&[a-z#0-9]+;/gi, function (e) { return ENTITIES[e.toLowerCase()] || ' '; })
        .replace(/־/g, ' ');
      for (const ch of text) {
        if (/\s/.test(ch)) flush();
        else {
          current += ch;
          if (depth > 0) currentHighlighted = true;
        }
      }
    });
    flush();
    return tokens;
  }

  function cleanWord(raw) {
    let w = raw.replace(MARKS, '').replace(/״/g, '"').replace(/׳/g, "'");
    w = w.replace(/^[^א-תװ-ײ0-9A-Za-z]+/, '').replace(/[^א-תװ-ײ0-9A-Za-z']+$/, '');
    return w;
  }

  /**
   * spec: { columns: [{ alts: [{ pattern: string|null }], loose?: string|null }], gaps: [{ n, dir }] }
   * pattern null = this alternative cannot be checked here (option needs the
   * engine's dictionary): a token the engine highlighted counts for it.
   * loose = what the engine searched for this column (union of the options);
   * it tells "found but not exact" from "not in the text".
   */
  function compile(spec) {
    return {
      columns: spec.columns.map(function (column) {
        const patterns = column.alts.map(function (a) { return a.pattern; }).filter(function (p) { return p != null; });
        return {
          regex: patterns.length ? new RegExp('^(?:' + patterns.join('|') + ')$') : null,
          trustHighlight: column.alts.some(function (a) { return a.pattern == null; }),
          loose: column.loose ? new RegExp('^(?:' + column.loose + ')$') : null,
        };
      }),
      gaps: spec.gaps,
    };
  }

  function positions(tokens, column) {
    const out = [];
    tokens.forEach(function (t, i) {
      if ((column.regex && column.regex.test(t.word)) || (column.trustHighlight && t.highlighted)) out.push(i);
    });
    return out;
  }

  function fits(a, b, gap) {
    const d = b - a;
    if (d === 0) return false;
    if (gap.dir === 'forward') return d >= 1 && d <= gap.n;
    return Math.abs(d) <= gap.n;
  }

  /**
   * true = the line satisfies the exact conditions, false = it does not,
   * null = a column was not found in the text at all (snippet cut?): keep the hit.
   */
  function check(html, compiled) {
    const tokens = tokenize(html);
    const lists = compiled.columns.map(function (c) { return positions(tokens, c); });
    let unknown = false;
    for (let i = 0; i < lists.length; i++) {
      if (lists[i].length) continue;
      const loose = compiled.columns[i].loose;
      if (loose && tokens.some(function (t) { return loose.test(t.word); })) return false;
      unknown = true;
    }
    if (unknown) return null;
    const chosen = [];
    function place(i) {
      if (i === lists.length) return true;
      for (const p of lists[i]) {
        if (chosen.indexOf(p) !== -1) continue;
        if (i > 0 && !fits(chosen[i - 1], p, compiled.gaps[i - 1])) continue;
        chosen.push(p);
        if (place(i + 1)) return true;
        chosen.pop();
      }
      return false;
    }
    return place(0);
  }

  /** Keeps the hits that satisfy the spec (or cannot be decided). */
  function filterHits(hits, spec) {
    const compiled = compile(spec);
    return hits.filter(function (hit) { return check(hit.text, compiled) !== false; });
  }

  return { tokenize, compile, check, filterHits };
});
