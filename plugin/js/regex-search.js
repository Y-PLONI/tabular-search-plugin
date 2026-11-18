/*
 * Wildcard / regex search inside the plugin.
 *
 * search.query strips regex characters, but search.fullText hands the query
 * to the engine unchanged, and the engine runs a `/…/` query as a regex over
 * the whole library. This is NOT documented in the plugin SDK and may be
 * blocked by a future Otzaria version; callers must fall back to
 * reader.openSearchTab when runRegexSearch() throws.
 *
 * Limits of this path: no streaming, no cancel, no offset, no counts, no
 * scope (filtered here, client side), pattern ≤ 300 characters, ~30 s RPC
 * timeout. Hits carry only book title, type and line index.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BIRegexSearch = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_PATTERN = 300;
  const HIT_LIMIT = 3000;
  const TIMEOUT_MS = 35000;

  class RegexSearchUnavailable extends Error {
    constructor(reason, cause) {
      super(reason);
      this.reason = reason;
      this.cause = cause;
    }
  }

  /** search.fullText row -> the hit shape the results view renders. */
  function toHit(row, categoryOf) {
    const type = row.type || 'text';
    return {
      bookId: row.book,
      book: row.book,
      type,
      index: row.index,
      text: row.text,
      textStatus: row.textStatus,
      error: row.error,
      reference: row.book + ' · שורה ' + (Number(row.index) + 1),
      categoryPath: categoryOf ? categoryOf({ bookId: row.book, type }) : null,
      mergedCount: 1,
    };
  }

  function under(path, ancestor) {
    return !!path && (path === ancestor || path.indexOf(ancestor + '/') === 0);
  }

  /**
   * Client-side corpus filter. scope: { all, categories, books }.
   * Hits whose category is unknown are kept only when the scope is "all".
   */
  function filterHits(hits, scope) {
    if (!scope || scope.all) return hits;
    const cats = scope.categories || [];
    const books = scope.books || [];
    return hits.filter(function (hit) {
      if (books.some(function (b) { return b.bookId === hit.bookId && (b.type || 'text') === hit.type; })) return true;
      return cats.some(function (c) { return under(hit.categoryPath, c); });
    });
  }

  /** Per-book counts in the shape of search.query's bookCounts. */
  function countByBook(hits) {
    const map = {};
    const order = [];
    hits.forEach(function (hit) {
      const key = hit.bookId + '|' + hit.type;
      if (!map[key]) {
        map[key] = { bookId: hit.bookId, type: hit.type, title: hit.book, count: 0 };
        order.push(key);
      }
      map[key].count++;
    });
    return order.map(function (k) { return map[k]; });
  }

  /**
   * The one replaceable entry point for running a regex inside the plugin.
   * regex: '/…/'. opts: { host, scope, categoryOf, ensureCategories }.
   * Resolves { hits, capped, total }; throws RegexSearchUnavailable when the
   * host cannot run it (missing method/permission, timeout, rejected pattern).
   */
  async function runRegexSearch(regex, opts) {
    const body = String(regex || '').replace(/^\/|\/$/g, '');
    if (body.length > MAX_PATTERN) throw new RegexSearchUnavailable('pattern-too-long');
    let rows;
    let timer = 0;
    try {
      rows = await Promise.race([
        opts.host.call('search.fullText', { query: regex, limit: HIT_LIMIT }),
        new Promise(function (_, reject) {
          timer = setTimeout(function () { reject(new Error('timeout')); }, TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      throw new RegexSearchUnavailable((error && (error.code || error.message)) || 'failed', error);
    } finally {
      clearTimeout(timer);
    }
    if (!Array.isArray(rows)) throw new RegexSearchUnavailable('unexpected-response');
    // Categories are needed for the corpus filter and for grouping by category.
    if (opts.ensureCategories) await opts.ensureCategories();
    const hits = filterHits(rows.map(function (row) { return toHit(row, opts.categoryOf); }), opts.scope);
    return { hits, capped: rows.length >= HIT_LIMIT, total: hits.length };
  }

  return { runRegexSearch, toHit, filterHits, countByBook, RegexSearchUnavailable, MAX_PATTERN, HIT_LIMIT };
});
