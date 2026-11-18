/*
 * "ניהול המאגרים": source tree with tri-state selection (category and book
 * level), "כתיבת מקורות" (find books by name), corpus groups and eras.
 * Scope shape: { all, categories: [path], books: [{id, bookId, type, title}], eras: [] }.
 */
(function (root) {
  'use strict';

  const D = root.BIDom;
  const Dlg = root.BIDialog;
  const L = root.BILibrary;
  const Host = root.BIHost;
  const Store = root.BIStore;
  const h = D.h;

  function emptyScope() {
    return { all: true, categories: [], books: [], eras: [] };
  }

  function normalizeScope(raw) {
    const s = emptyScope();
    if (!raw || typeof raw !== 'object') return s;
    s.all = raw.all !== false;
    s.categories = Array.isArray(raw.categories) ? raw.categories.filter(function (p) { return typeof p === 'string' && p[0] === '/'; }) : [];
    s.books = Array.isArray(raw.books) ? raw.books.filter(function (b) { return b && (b.id != null || b.bookId); }) : [];
    s.eras = Array.isArray(raw.eras) ? raw.eras.filter(function (e) { return typeof e === 'string'; }) : [];
    return s;
  }

  /** Short Hebrew description for the top bar chip. */
  function describeScope(scope) {
    const parts = [];
    if (scope.all) parts.push('כל הספרייה');
    else {
      if (scope.categories.length === 1 && !scope.books.length) parts.push(L.pathLabel(scope.categories[0]));
      else if (scope.books.length === 1 && !scope.categories.length) parts.push(scope.books[0].title || scope.books[0].bookId);
      else {
        if (scope.categories.length) parts.push(scope.categories.length + ' קטגוריות');
        if (scope.books.length) parts.push(scope.books.length + ' ספרים');
        if (!parts.length) parts.push('לא נבחרו מאגרים');
      }
    }
    if (scope.eras.length) parts.push(scope.eras.join(', '));
    return parts.join(' · ');
  }

  function isUnder(path, ancestor) {
    return ancestor === '/' || path === ancestor || path.indexOf(ancestor + '/') === 0;
  }

  function openCorpus(app) {
    const scope = normalizeScope(JSON.parse(JSON.stringify(app.state.scope)));
    const treeBox = h('div', { class: 'tree', role: 'tree', 'aria-label': 'עץ מקורות' });
    const filter = h('input', { class: 'input', type: 'text', placeholder: 'סינון לפי שם', 'aria-label': 'סינון העץ' });
    const summary = h('div', { class: 'corpus-summary muted' });
    const eraBox = h('div', { class: 'extras' });
    const expanded = {};
    let tree = null;

    // ── selection logic ──
    function bookKey(book) { return L.bookKey(book); }
    function bookSelectedDirect(book) {
      const key = bookKey(book);
      return scope.books.some(function (b) { return bookKey(b) === key; });
    }
    function selectedAncestor(path) {
      if (scope.all) return '/';
      for (let i = 0; i < scope.categories.length; i++) {
        if (isUnder(path, scope.categories[i])) return scope.categories[i];
      }
      return null;
    }
    function categoryState(node) {
      if (selectedAncestor(node.path)) return 'on';
      const partial = scope.categories.some(function (p) { return isUnder(p, node.path); }) ||
        scope.books.some(function (b) {
          const cat = L.categoryOf(b);
          return cat && isUnder(cat, node.path);
        });
      return partial ? 'partial' : 'off';
    }
    function bookState(book, parentPath) {
      return selectedAncestor(parentPath) || bookSelectedDirect(book) ? 'on' : 'off';
    }

    /** Replaces the selected ancestor by its children, minus the excluded item. */
    function explode(ancestorPath, exclude) {
      if (ancestorPath === '/') scope.all = false;
      else scope.categories = scope.categories.filter(function (p) { return p !== ancestorPath; });
      const node = ancestorPath === '/' ? tree : L.nodeAt(ancestorPath);
      if (!node) return;
      (node.categories || []).forEach(function (child) {
        if (exclude.path === child.path) return;
        if (isUnder(exclude.path, child.path)) explode2(child, exclude);
        else scope.categories.push(child.path);
      });
      (node.books || []).forEach(function (book) {
        if (exclude.book && bookKey(book) === bookKey(exclude.book)) return;
        scope.books.push(slimBook(book));
      });
    }
    function explode2(node, exclude) {
      (node.categories || []).forEach(function (child) {
        if (exclude.path === child.path) return;
        if (isUnder(exclude.path, child.path)) explode2(child, exclude);
        else scope.categories.push(child.path);
      });
      (node.books || []).forEach(function (book) {
        if (exclude.book && bookKey(book) === bookKey(exclude.book)) return;
        scope.books.push(slimBook(book));
      });
    }
    function slimBook(book) {
      return { id: book.id != null ? book.id : undefined, bookId: book.bookId, type: book.type || 'text', title: book.title || book.bookId };
    }

    function toggleCategory(node) {
      const ancestor = selectedAncestor(node.path);
      if (ancestor === node.path) {
        scope.categories = scope.categories.filter(function (p) { return p !== node.path; });
      } else if (ancestor) {
        explode(ancestor, { path: node.path });
      } else {
        scope.categories = scope.categories.filter(function (p) { return !isUnder(p, node.path); });
        scope.books = scope.books.filter(function (b) {
          const cat = L.categoryOf(b);
          return !(cat && isUnder(cat, node.path));
        });
        scope.categories.push(node.path);
      }
      render();
    }

    function toggleBook(book, parentPath) {
      const ancestor = selectedAncestor(parentPath);
      if (ancestor) {
        explode(ancestor, { path: parentPath + '/\u0000', book });
      } else if (bookSelectedDirect(book)) {
        const key = bookKey(book);
        scope.books = scope.books.filter(function (b) { return bookKey(b) !== key; });
      } else {
        scope.books.push(slimBook(book));
      }
      render();
    }

    // ── rendering ──
    function checkbox(state, label, onchange) {
      const input = h('input', { type: 'checkbox', 'aria-label': label, onchange });
      input.checked = state === 'on';
      input.indeterminate = state === 'partial';
      return input;
    }

    function categoryRow(node, depth) {
      const state = categoryState(node);
      const hasChildren = (node.categories && node.categories.length) || (node.books && node.books.length);
      const open = !!expanded[node.path];
      const row = h('div', { class: 'tree-row', role: 'treeitem', 'aria-expanded': hasChildren ? String(open) : null, style: '--depth:' + depth },
        hasChildren
          ? D.iconButton(open ? 'chevron' : 'next', open ? 'כיווץ' : 'הרחבה', function () { expanded[node.path] = !open; render(); }, 'tiny tree-toggle' + (open ? '' : ' closed'))
          : h('span', { class: 'tree-toggle-space' }),
        h('label', { class: 'checkbox tree-label ' + state },
          checkbox(state, node.title, function () { toggleCategory(node); }),
          D.icon('library'),
          h('span', null, node.title)));
      const frag = document.createDocumentFragment();
      frag.appendChild(row);
      if (open) {
        (node.categories || []).forEach(function (child) { frag.appendChild(categoryRow(child, depth + 1)); });
        (node.books || []).forEach(function (book) { frag.appendChild(bookRow(book, node.path, depth + 1)); });
      }
      return frag;
    }

    function bookRow(book, parentPath, depth, showPath) {
      const state = bookState(book, parentPath);
      return h('div', { class: 'tree-row', role: 'treeitem', style: '--depth:' + depth },
        h('span', { class: 'tree-toggle-space' }),
        h('label', { class: 'checkbox tree-label book ' + state },
          checkbox(state, book.title, function () { toggleBook(book, parentPath); }),
          D.icon('open'),
          h('span', null, book.title),
          showPath ? h('span', { class: 'muted small' }, ' · ' + L.pathLabel(parentPath)) : null));
    }

    function renderTree() {
      D.clear(treeBox);
      if (!tree) {
        treeBox.appendChild(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'טוען את עץ הספרייה…'));
        return;
      }
      const needle = filter.value.trim();
      if (needle) {
        let shown = 0;
        (function walk(node) {
          if (shown > 300) return;
          (node.categories || []).forEach(function (c) {
            if (c.title.indexOf(needle) !== -1 && shown++ < 300) treeBox.appendChild(categoryRow(c, 0));
            walk(c);
          });
          (node.books || []).forEach(function (b) {
            if (b.title.indexOf(needle) !== -1 && shown++ < 300) treeBox.appendChild(bookRow(b, node.path, 0, true));
          });
        })(tree);
        if (!shown) treeBox.appendChild(h('p', { class: 'muted empty' }, 'לא נמצא.'));
        return;
      }
      (tree.categories || []).forEach(function (c) { treeBox.appendChild(categoryRow(c, 0)); });
      (tree.books || []).forEach(function (b) { treeBox.appendChild(bookRow(b, tree.path || '/', 0)); });
    }

    function renderEras() {
      Array.prototype.forEach.call(eraBox.children, function (chip) {
        chip.setAttribute('aria-pressed', String(scope.eras.indexOf(chip.dataset.era) !== -1));
      });
    }

    function render() {
      renderTree();
      renderEras();
      summary.textContent = 'נבחר: ' + describeScope(scope);
    }

    // ── כתיבת מקורות ──
    const findInput = h('input', { class: 'input', type: 'text', dir: 'rtl', placeholder: 'למשל: רש"י גיטין', 'aria-label': 'שם ספר' });
    const findList = h('div', { class: 'tree' });
    async function find() {
      const q = findInput.value.trim();
      D.clear(findList);
      if (!q) return;
      findList.appendChild(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'מחפש…'));
      let books = [];
      try {
        books = await Host.call('library.findBooks', { query: q, limit: 50 });
      } catch (error) {
        D.clear(findList).appendChild(h('p', { class: 'error-text' }, Host.describeError(error)));
        return;
      }
      D.clear(findList);
      if (!books || !books.length) {
        findList.appendChild(h('p', { class: 'muted empty' }, 'לא נמצאו ספרים.'));
        return;
      }
      books.forEach(function (book) {
        const added = bookSelectedDirect(book);
        findList.appendChild(h('div', { class: 'tree-row' },
          h('span', { class: 'tree-label book' }, D.icon('open'), h('span', null, book.title),
            book.categoryPath ? h('span', { class: 'muted small' }, ' · ' + L.pathLabel(book.categoryPath)) : null),
          h('span', { class: 'spacer' }),
          D.button(added ? 'נוסף' : 'הוסף', {
            icon: added ? 'check' : 'add',
            disabled: added,
            onclick: function () {
              if (scope.all) { scope.all = false; scope.categories = []; scope.books = []; }
              scope.books.push(slimBook(book));
              render();
              find();
            },
          })));
      });
    }
    findInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); find(); }
    });

    const treePanel = h('div', { class: 'corpus-panel' }, filter, treeBox);
    const findPanel = h('div', { class: 'corpus-panel', hidden: true },
      h('div', { class: 'row-tools' }, findInput, D.button('חפש והוסף', { icon: 'search', onclick: find })),
      h('p', { class: 'muted small' }, 'הקלידו שם ספר; "הוסף" מצרף אותו לבחירה.'),
      findList);
    const tabTree = h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': 'true', onclick: function () { showTab(true); } }, 'עץ מקורות');
    const tabFind = h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': 'false', onclick: function () { showTab(false); } }, 'כתיבת מקורות');
    function showTab(treeTab) {
      tabTree.setAttribute('aria-selected', String(treeTab));
      tabFind.setAttribute('aria-selected', String(!treeTab));
      treePanel.hidden = !treeTab;
      findPanel.hidden = treeTab;
      (treeTab ? filter : findInput).focus();
    }

    // ── side buttons (Bar-Ilan's left column) ──
    function showSelected() {
      const rows = [];
      if (scope.all) rows.push(h('p', null, 'כל הספרייה.'));
      scope.categories.forEach(function (p) {
        rows.push(h('div', { class: 'tree-row' }, D.icon('library'), h('span', null, L.pathLabel(p)), h('span', { class: 'spacer' }),
          D.iconButton('close', 'הסרה', function () { scope.categories = scope.categories.filter(function (x) { return x !== p; }); render(); dlg2.close(); showSelected(); }, 'tiny')));
      });
      scope.books.forEach(function (b) {
        rows.push(h('div', { class: 'tree-row' }, D.icon('open'), h('span', null, b.title || b.bookId), h('span', { class: 'spacer' }),
          D.iconButton('close', 'הסרה', function () { toggleBook(b, '\u0000'); dlg2.close(); showSelected(); }, 'tiny')));
      });
      if (!rows.length) rows.push(h('p', { class: 'muted' }, 'לא נבחרו מאגרים.'));
      if (scope.eras.length) rows.push(h('p', { class: 'muted' }, 'תקופות: ' + scope.eras.join(', ')));
      const dlg2 = Dlg.openDialog({
        title: 'רשימת המאגרים שנבחרו',
        size: 'sm',
        body: h('div', { class: 'tree' }, rows),
        actions: ['spacer', { label: 'סגירה', variant: 'filled' }],
      });
    }

    function openGroups() {
      const groups = Store.data.scopeGroups.slice();
      const list = root.BIDialogs.createListbox('קבוצות מאגרים', function (g) {
        return h('div', { class: 'list-entry' }, h('strong', null, g.name), h('span', { class: 'muted small' }, describeScope(normalizeScope(g.scope))));
      }, function (i) { load(i); });
      function fill() {
        list.set(groups);
        if (!groups.length) list.el.appendChild(h('p', { class: 'muted empty' }, 'אין קבוצות שמורות.'));
      }
      function load(i) {
        if (i < 0) return;
        Object.assign(scope, normalizeScope(JSON.parse(JSON.stringify(groups[i].scope))));
        render();
        dlg3.close();
      }
      const dlg3 = Dlg.openDialog({
        title: 'קבוצות מאגרים',
        size: 'sm',
        body: list.el,
        actions: [
          { label: 'שמור בחירה', icon: 'save', onclick: function () {
            Dlg.prompt('קבוצת מאגרים חדשה', 'שם הקבוצה', '').then(function (name) {
              if (!name) return;
              const copy = groups.filter(function (g) { return g.name !== name; });
              copy.unshift({ name, scope: JSON.parse(JSON.stringify(scope)) });
              groups.length = 0;
              Array.prototype.push.apply(groups, copy);
              Store.setScopeGroups(groups);
              fill();
            });
          } },
          { label: 'מחק', icon: 'trash', onclick: function () {
            const i = list.selectedIndex();
            if (i < 0) return;
            groups.splice(i, 1);
            Store.setScopeGroups(groups);
            fill();
          } },
          'spacer',
          { label: 'ביטול' },
          { label: 'טען', variant: 'filled', onclick: function () { load(list.selectedIndex()); } },
        ],
      });
      fill();
    }

    const side = h('div', { class: 'corpus-side' },
      D.button('רשימת המאגרים שנבחרו', { onclick: showSelected }),
      D.button('קבוצות מאגרים', { onclick: openGroups }),
      h('span', { class: 'field-caption' }, 'תקופות'),
      eraBox,
      h('span', { class: 'spacer-v' }),
      D.button('התחל שוב', { title: 'ביטול כל הבחירה', onclick: function () {
        scope.all = false; scope.categories = []; scope.books = []; scope.eras = []; render();
      } }),
      D.button('בחר הכל', { onclick: function () {
        scope.all = true; scope.categories = []; scope.books = []; render();
      } }),
      D.button('קטלוג', { title: 'חיפוש ספר לפי שם', onclick: function () { showTab(false); } }));

    const dlg = Dlg.openDialog({
      title: 'ניהול המאגרים',
      size: 'lg',
      initialFocus: filter,
      body: h('div', { class: 'corpus' },
        h('div', { class: 'corpus-main' },
          h('div', { class: 'tabs', role: 'tablist' }, tabTree, tabFind),
          treePanel,
          findPanel,
          summary),
        side),
      actions: [
        'spacer',
        { label: 'ביטול' },
        { label: 'אישור', variant: 'filled', onclick: function (close) {
          if (!scope.all && !scope.categories.length && !scope.books.length) {
            Host.notifyError('לא נבחרו מאגרים. בחרו לפחות קטגוריה או ספר, או "בחר הכל".');
            return;
          }
          app.setScope(scope);
          close();
        } },
      ],
    });

    app.searchOptions().then(function (opts) {
      ((opts && opts.eras) || []).forEach(function (era) {
        eraBox.appendChild(h('button', {
          type: 'button',
          class: 'chip',
          dataset: { era },
          'aria-pressed': 'false',
          title: 'צמצום לספרי תקופה זו (בנוסף לבחירה בעץ)',
          onclick: function () {
            const at = scope.eras.indexOf(era);
            if (at === -1) scope.eras.push(era); else scope.eras.splice(at, 1);
            render();
          },
        }, era));
      });
      renderEras();
    });

    render();
    L.loadTree().then(function (loaded) {
      tree = loaded;
      render();
    }, function (error) {
      D.clear(treeBox).appendChild(h('p', { class: 'error-text' }, 'טעינת עץ הספרייה נכשלה. ' + Host.describeError(error)));
    });
    filter.addEventListener('input', D.debounce(renderTree, 200));
    return dlg;
  }

  root.BICorpus = { openCorpus, emptyScope, normalizeScope, describeScope };
})(window);
