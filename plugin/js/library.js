/*
 * Library tree for the corpus dialog ("המאגרים המשתתפים") and for grouping
 * results by category. Loaded once, on first use.
 */
(function (root) {
  'use strict';

  const Host = root.BIHost;
  let treePromise = null;
  let index = null;

  function bookKey(book) {
    if (book.id != null) return 'id:' + book.id;
    return 'b:' + book.bookId + '|' + (book.type || 'text');
  }

  function buildIndex(tree) {
    const nodes = {};
    const bookPaths = {};
    (function walk(node) {
      nodes[node.path] = node;
      (node.books || []).forEach(function (book) {
        bookPaths[bookKey(book)] = node.path;
        bookPaths['b:' + book.bookId + '|' + (book.type || 'text')] = node.path;
      });
      (node.categories || []).forEach(walk);
    })(tree);
    return { nodes, bookPaths };
  }

  function loadTree() {
    if (!treePromise) {
      treePromise = Host.call('library.getTree', { includeBooks: true }).then(function (tree) {
        if (!tree) throw new Error('empty tree');
        index = buildIndex(tree);
        return tree;
      });
      treePromise.catch(function () { treePromise = null; });
    }
    return treePromise;
  }

  function nodeAt(path) {
    return index ? index.nodes[path] || null : null;
  }

  function categoryOf(book) {
    if (!index) return null;
    return index.bookPaths[bookKey(book)] || index.bookPaths['b:' + book.bookId + '|' + (book.type || 'text')] || null;
  }

  /** "/תנך/תורה" -> "תנך › תורה" */
  function pathLabel(path) {
    return String(path || '').split('/').filter(Boolean).join(' › ');
  }

  function topCategory(path) {
    const first = String(path || '').split('/').filter(Boolean)[0];
    return first ? '/' + first : null;
  }

  root.BILibrary = { loadTree, nodeAt, categoryOf, bookKey, pathLabel, topCategory, isLoaded: function () { return !!index; } };
})(window);
