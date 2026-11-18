/*
 * Results: header with count and actions, "results by book" side list
 * (from includeBookCounts, i.e. the whole result set), hit list with
 * highlighted context, paging.
 */
(function (root) {
  'use strict';

  const D = root.BIDom;
  const L = root.BILibrary;
  const h = D.h;

  const ORDERS = [
    { value: 'catalogue', label: 'סדר הספרייה' },
    { value: 'relevance', label: 'רלוונטיות' },
    { value: 'generation', label: 'סדר הדורות' },
  ];
  const PAGE_SIZES = [50, 100, 200, 500];
  const MAX_WINDOW = 10000;

  function createResultsView(app) {
    const status = h('div', { class: 'results-status', role: 'status', 'aria-live': 'polite' });
    const queryLine = h('div', { class: 'results-query' });
    const filterChip = h('div', { class: 'results-filter' });
    const list = h('div', { class: 'hit-list', role: 'list' });
    const books = h('div', { class: 'book-list' });
    const pager = h('nav', { class: 'pager', 'aria-label': 'דפדוף בתוצאות' });

    const orderSelect = h('select', {
      class: 'input select',
      'aria-label': 'מיון',
      title: 'מיון התוצאות',
      onchange: function () { app.setResultsPrefs({ order: orderSelect.value }); },
    }, ORDERS.map(function (o) { return h('option', { value: o.value }, o.label); }));
    const sizeSelect = h('select', {
      class: 'input select',
      'aria-label': 'תוצאות בעמוד',
      title: 'תוצאות בעמוד',
      onchange: function () { app.setResultsPrefs({ pageSize: parseInt(sizeSelect.value, 10) }); },
    }, PAGE_SIZES.map(function (n) { return h('option', { value: String(n) }, n + ' בעמוד'); }));

    const stopButton = D.button('עצור', { icon: 'stop', onclick: function () { app.stopSearch(); }, title: 'עצירת החיפוש (Esc)' });
    const head = h('div', { class: 'results-head' },
      h('div', { class: 'results-actions' },
        D.button('ערוך חיפוש', { icon: 'back', onclick: function () { app.editSearch(); } }),
        D.button('חיפוש חדש', { icon: 'add', onclick: function () { app.newSearch(); } })),
      status,
      h('div', { class: 'results-actions end' },
        orderSelect,
        sizeSelect,
        stopButton,
        D.iconButton('save', 'שמירת החיפוש ("חיפושים שמורים")', function () { app.saveCurrentSearch(); }),
        D.iconButton('external', 'פתח בחיפוש של אוצריא', function () { app.openCurrentInOtzaria(); })));

    const aside = h('aside', { class: 'results-aside', 'aria-label': 'תוצאות לפי ספרים' },
      h('h3', { class: 'card-title' }, 'תוצאות לפי ספרים'),
      books);

    const el = h('div', { class: 'results' },
      head,
      h('div', { class: 'results-sub' }, queryLine, filterChip),
      h('div', { class: 'results-body' },
        aside,
        h('div', { class: 'results-main' }, list, pager)));

    let renderedCount = 0;

    function r() { return app.results; }

    function renderStatus() {
      const res = r();
      D.clear(status);
      if (res.running && res.total == null) {
        status.appendChild(h('span', { class: 'spinner', 'aria-hidden': 'true' }));
        status.appendChild(h('span', null, 'מחפש…'));
      } else if (res.error) {
        status.appendChild(h('span', { class: 'error-text' }, res.error));
      } else if (res.total === 0) {
        status.appendChild(h('span', null, 'לא נמצאו תוצאות'));
      } else if (res.total != null) {
        status.appendChild(h('strong', null, res.total.toLocaleString('he-IL')));
        status.appendChild(h('span', null, ' תוצאות' + (res.truncated ? ' (חלקי – השאילתה רחבה מדי)' : '')));
        if (res.truncated && res.compiled && res.compiled.route === 'regex') {
          status.appendChild(h('span', { class: 'muted small' }, ' – מוצגות רק התוצאות הראשונות'));
        }
        if (res.running) status.appendChild(h('span', { class: 'spinner small', 'aria-hidden': 'true' }));
      }
      stopButton.hidden = !res.running;
      orderSelect.value = app.state.order;
      const regex = !!(res.compiled && res.compiled.route === 'regex');
      orderSelect.disabled = regex;
      orderSelect.title = regex ? 'בחיפוש עם תווים כלליים התוצאות בסדר שהמנוע מחזיר' : 'מיון התוצאות';
      sizeSelect.value = String(app.state.pageSize);
    }

    function renderQuery() {
      const res = r();
      D.clear(queryLine);
      queryLine.appendChild(h('span', { class: 'muted' }, 'שאילתה: '));
      queryLine.appendChild(D.syntaxNode(res.request ? res.request.syntax : ''));
      (res.warnings || []).forEach(function (w) {
        queryLine.appendChild(h('span', { class: 'warn-chip', title: w.text }, w.text));
      });
      D.clear(filterChip);
      if (res.filter) {
        filterChip.appendChild(h('span', { class: 'chip active' },
          h('span', null, 'מסונן: ' + res.filter.label),
          D.iconButton('close', 'ביטול הסינון', function () { app.setResultsFilter(null); }, 'tiny')));
      }
    }

    function hitElement(hit, number) {
      const open = function (side) { app.openHit(hit, side); };
      const textEl = h('div', { class: 'hit-text' });
      if (hit.error === 'forbidden') textEl.appendChild(h('span', { class: 'muted' }, 'המו"ל אינו מאפשר להציג קטע מספר זה.'));
      else if (hit.textStatus === 'unavailable') textEl.appendChild(h('span', { class: 'muted' }, 'הטקסט אינו זמין כעת.'));
      else {
        textEl.appendChild(D.safeSnippet(hit.text));
        if (hit.textStatus === 'stale') {
          textEl.appendChild(h('span', { class: 'muted small' }, ' (הספר עודכן מאז האינדקס)'));
        }
      }
      const item = h('article', {
        class: 'hit',
        role: 'listitem',
        tabindex: '0',
        title: 'לחיצה: פתיחה במקום',
        onclick: function (event) {
          if (event.target.closest('button')) return;
          open(false);
        },
        onkeydown: function (event) {
          if (event.key === 'Enter') { event.preventDefault(); open(event.shiftKey); }
          else if (event.key === 'ArrowDown' && item.nextElementSibling) { event.preventDefault(); item.nextElementSibling.focus(); }
          else if (event.key === 'ArrowUp' && item.previousElementSibling) { event.preventDefault(); item.previousElementSibling.focus(); }
        },
      },
      h('div', { class: 'hit-head' },
        h('span', { class: 'hit-num' }, number + '.'),
        h('span', { class: 'hit-ref' }, hit.reference || hit.book),
        hit.categoryPath ? h('span', { class: 'hit-cat' }, L.pathLabel(hit.categoryPath)) : null,
        hit.mergedCount > 1 ? h('span', { class: 'hit-cat' }, '+' + (hit.mergedCount - 1) + ' זהים') : null,
        h('span', { class: 'spacer' }),
        D.iconButton('side', 'פתיחה לצד הספר הפתוח (Shift+Enter)', function () { open(true); }, 'tiny'),
        D.iconButton('open', 'פתיחה במקום (Enter)', function () { open(false); }, 'tiny')),
      textEl);
      return item;
    }

    function appendHits(hits) {
      const res = r();
      const frag = document.createDocumentFragment();
      hits.forEach(function (hit) {
        renderedCount++;
        frag.appendChild(hitElement(hit, res.offset + renderedCount));
      });
      list.appendChild(frag);
      renderStatus();
    }

    function renderBooks() {
      const res = r();
      D.clear(books);
      const counts = res.bookCounts;
      if (!counts) {
        books.appendChild(h('p', { class: 'muted small' }, res.running ? 'טוען…' : 'אין נתונים.'));
        return;
      }
      if (!counts.length) {
        books.appendChild(h('p', { class: 'muted small' }, 'אין תוצאות.'));
        return;
      }
      const groups = {};
      const order = [];
      counts.forEach(function (book) {
        const cat = L.topCategory(L.categoryOf(book)) || '';
        if (!groups[cat]) { groups[cat] = { total: 0, books: [] }; order.push(cat); }
        groups[cat].total += book.count;
        groups[cat].books.push(book);
      });
      order.sort(function (a, b) { return groups[b].total - groups[a].total; });
      order.forEach(function (cat) {
        const group = groups[cat];
        const details = h('details', { class: 'book-group', open: order.length <= 3 ? true : null },
          h('summary', null,
            h('span', { class: 'book-title' }, cat ? L.pathLabel(cat) : 'ספרים'),
            h('span', { class: 'count' }, group.total.toLocaleString('he-IL')),
            cat ? D.iconButton('filter', 'הצג רק תוצאות מ"' + L.pathLabel(cat) + '"', function (event) {
              event.preventDefault();
              app.setResultsFilter({ label: L.pathLabel(cat), scope: { categories: [cat] } });
            }, 'tiny') : null));
        group.books.sort(function (a, b) { return b.count - a.count; }).forEach(function (book) {
          details.appendChild(h('button', {
            type: 'button',
            class: 'book-row',
            title: 'הצג רק תוצאות מ"' + book.title + '"',
            onclick: function () {
              app.setResultsFilter({
                label: book.title,
                scope: { books: [{ id: book.id, bookId: book.bookId, type: book.type }] },
              });
            },
          }, h('span', { class: 'book-title' }, book.title), h('span', { class: 'count' }, book.count.toLocaleString('he-IL'))));
        });
        books.appendChild(details);
      });
    }

    function renderPager() {
      const res = r();
      D.clear(pager);
      if (!res.total) return;
      const from = res.offset + 1;
      const to = res.offset + renderedCount;
      const reachable = Math.min(res.total, MAX_WINDOW);
      const prev = D.button('הקודם', {
        icon: 'prev',
        disabled: res.offset === 0 || res.running,
        onclick: function () { app.goToPage(Math.max(0, res.offset - res.limit)); },
      });
      const next = D.button('הבא', {
        icon: 'next',
        class: 'icon-end',
        disabled: res.offset + res.limit >= reachable || res.running,
        onclick: function () { app.goToPage(res.offset + res.limit); },
      });
      pager.appendChild(prev);
      pager.appendChild(h('span', { class: 'muted' },
        from.toLocaleString('he-IL') + '–' + to.toLocaleString('he-IL') + ' מתוך ' + res.total.toLocaleString('he-IL')));
      pager.appendChild(next);
      if (res.total > MAX_WINDOW) {
        pager.appendChild(h('span', { class: 'muted small' }, 'אפשר לדפדף עד 10,000 התוצאות הראשונות. צמצמו את החיפוש כדי לראות את השאר.'));
      }
    }

    function reset() {
      renderedCount = 0;
      D.clear(list);
      list.scrollTop = 0;
      renderStatus();
      renderQuery();
      renderBooks();
      renderPager();
    }

    function refreshMeta() {
      renderStatus();
      renderBooks();
    }

    function done() {
      renderStatus();
      renderPager();
      if (r().total === 0 && !r().error) {
        list.appendChild(h('div', { class: 'empty-state' },
          h('p', null, 'לא נמצאו תוצאות.'),
          h('p', { class: 'muted' }, 'נסו להוסיף מאפיינים (ק, ס, ח), להגדיל מרחקים או להרחיב את המאגרים.')));
      }
    }

    function focusFirst() {
      const first = list.querySelector('.hit');
      if (first) first.focus();
    }

    return { el, reset, appendHits, refreshMeta, done, renderBooks, focusFirst };
  }

  root.BIResultsView = { createResultsView, PAGE_SIZES, MAX_WINDOW };
})(window);
