/*
 * Wiring: state, Bar-Ilan frame (mode rail, form, action column), search
 * flow, results, persistence and tab restore. Boot starts on plugin.boot.
 */
(function (root) {
  'use strict';

  const M = root.BIModel;
  const C = root.BICompile;
  const S = root.BISyntax;
  const F = root.BIForms;
  const Host = root.BIHost;
  const Store = root.BIStore;
  const D = root.BIDom;
  const Dlg = root.BIDialog;
  const Dialogs = root.BIDialogs;
  const Corpus = root.BICorpus;
  const h = D.h;

  const RESTORE_SCHEMA = 1;
  const VIEW_TITLES = {
    free: 'חיפוש בניסוח חופשי',
    easy: 'חיפוש קל',
    table: 'חיפוש טבלאי',
    advanced: 'חיפוש מתקדם',
    results: 'תוצאות החיפוש',
  };

  const app = {
    state: {
      view: 'table',
      formView: 'table',
      table: M.createEmptyQuery(),
      focus: { col: 0, row: 0 },
      markAll: false,
      easy: { text: '', withAdditions: true, prefixFirst: true, distance: true, plene: false },
      advanced: { text: '' },
      free: { text: '' },
      options: { searchAll: false, includeAcronyms: false, showForms: false },
      scope: Corpus.emptyScope(),
      order: 'catalogue',
      pageSize: 50,
    },
    results: null,
    lastInput: null,
  };

  const session = root.BISession.createSession();
  let views = {};
  let els = {};
  let optionsPromise = null;

  // ── state helpers ──────────────────────────────────────────────────────────

  app.focusedField = function () {
    const f = app.state.focus;
    const column = app.state.table.columns[f.col];
    return column ? column.fields[f.row] : null;
  };

  app.setFocus = function (col, row, input) {
    app.state.focus = { col, row };
    app.lastInput = input;
    views.table.refresh();
    views.props.refresh();
  };

  app.setLineFocus = function (input) {
    app.lastInput = input;
  };

  app.changed = function (reason) {
    if (reason === 'options' || reason === 'flags' || reason === 'families') refreshForm();
    schedulePreview();
    scheduleRestore();
    if (reason === 'options') Store.setPrefs({ options: pickOptions() });
  };

  function pickOptions() {
    return { searchAll: !!app.state.options.searchAll, includeAcronyms: !!app.state.options.includeAcronyms };
  }

  app.toggleFlag = function (letter) {
    if (app.state.formView !== 'table') return;
    const table = app.state.table;
    const focused = app.focusedField();
    let targets = [focused];
    if (app.state.markAll) {
      targets = [];
      table.columns.forEach(function (c) { c.fields.forEach(function (f) { if (M.isFieldFilled(f)) targets.push(f); }); });
      if (!targets.length) targets = [focused];
    }
    if (letter === '') targets.forEach(function (f) { f.flags = []; });
    else {
      const allHave = targets.every(function (f) { return f.flags.indexOf(letter) !== -1; });
      targets.forEach(function (f) {
        const has = f.flags.indexOf(letter) !== -1;
        if (allHave ? has : !has) M.toggleFlag(f, letter);
      });
    }
    app.changed('flags');
    if (app.lastInput && document.body.contains(app.lastInput)) app.lastInput.focus();
  };

  // ── building the current query ─────────────────────────────────────────────

  /** -> { view, query, text, syntax, result } for the active form. */
  function buildCurrent(ctx) {
    const st = app.state;
    const view = st.formView;
    let query = null;
    const parseErrors = [];
    let text = '';
    if (view === 'table') query = M.cloneQuery(st.table);
    else if (view === 'easy') {
      text = st.easy.text.trim();
      query = F.easyToQuery(text, st.easy);
    } else if (view === 'advanced') {
      text = st.advanced.text.trim();
      const parsed = F.advancedToQuery(text);
      query = parsed.query;
      parsed.errors.forEach(function (e) { parseErrors.push(e); });
    }
    if (!query) {
      return { view, query: null, text, syntax: text, result: { ok: false, errors: parseErrors.length ? parseErrors : ['יש להקליד לפחות מילה אחת.'], warnings: [] } };
    }
    query.searchAll = !!st.options.searchAll;
    query.includeAcronyms = view !== 'easy' && !!st.options.includeAcronyms;
    const result = C.compile(query, Object.assign({
      families: Store.data.families,
      scope: st.scope,
      order: st.order,
      limit: st.pageSize,
    }, ctx || {}));
    if (parseErrors.length) {
      result.ok = false;
      result.errors = parseErrors.concat(result.errors);
    }
    return { view, query, text, syntax: view === 'table' || view === 'advanced' ? result.syntax : text, result };
  }

  // ── preview card ───────────────────────────────────────────────────────────

  function createPreview() {
    const line = h('div', { class: 'preview-line' });
    const notes = h('ul', { class: 'preview-notes' });
    const tools = h('div', { class: 'preview-tools' });
    const el = h('section', { class: 'card preview-card', 'aria-label': 'תצוגת השאילתה', 'aria-live': 'polite' },
      h('div', { class: 'card-title-row' }, h('h3', { class: 'card-title' }, 'השאילתה'), tools),
      line, notes);

    function refresh() {
      D.clear(line);
      D.clear(notes);
      D.clear(tools);
      const view = app.state.formView;
      if (view === 'free') {
        line.appendChild(h('span', { class: 'muted' }, 'תיפתח בחיפוש של אוצריא, בלי הרצה.'));
        return;
      }
      const built = buildCurrent();
      const res = built.result;
      const empty = view === 'table' ? M.isEmptyQuery(app.state.table) : !built.text;
      if (empty) {
        line.appendChild(h('span', { class: 'muted' }, 'הקלידו מילים כדי לבנות שאילתה.'));
      } else {
        line.appendChild(D.syntaxNode(built.syntax || '—'));
        if (res.ok) {
          line.appendChild(h('span', { class: 'route-chip' + (res.route === 'regex' ? ' external' : '') },
            res.route === 'regex' ? 'ייפתח בחיפוש של אוצריא' : 'תוצאות כאן'));
        }
        res.errors.forEach(function (e) { notes.appendChild(h('li', { class: 'error-text' }, e)); });
        if (!res.errors.length) res.warnings.forEach(function (w) { notes.appendChild(h('li', { class: 'warn-text' }, w.text)); });
      }
      if (view === 'table' && !empty) {
        tools.appendChild(D.button('ערוך כתחביר', { title: 'העברת השאילתה ל"חיפוש מתקדם"', onclick: function () {
          app.state.advanced.text = S.stringify(app.state.table);
          switchView('advanced');
        } }));
      }
      if (view === 'advanced' && res.ok !== undefined && built.query && M.fitsTable(built.query) && !empty) {
        tools.appendChild(D.button('הצג בטבלה', { title: 'העברת השאילתה ל"חיפוש טבלאי"', onclick: function () {
          app.state.table = M.fitToTable(built.query);
          app.state.focus = { col: 0, row: 0 };
          switchView('table');
        } }));
      }
      if (res.ok && res.tab) {
        tools.appendChild(D.iconButton('external', 'פתח בחיפוש של אוצריא', function () { openTab(res.tab, true); }));
      }
    }
    return { el, refresh };
  }

  const schedulePreview = D.debounce(function () { if (views.preview) views.preview.refresh(); }, 120);

  // ── frame: top bar, rail, actions ──────────────────────────────────────────

  function railButton(view, iconName, label, title) {
    return h('button', {
      type: 'button',
      class: 'rail-btn',
      dataset: { view },
      title: title || label,
      'aria-label': label,
      onclick: function () {
        if (view === 'corpus') app.openDialog('corpus');
        else switchView(view);
      },
    }, D.icon(iconName), h('span', { class: 'rail-label' }, label));
  }

  function buildFrame() {
    const scopeChip = h('button', {
      type: 'button',
      class: 'topbar-chip',
      title: 'המאגרים המשתתפים',
      onclick: function () { app.openDialog('corpus'); },
    }, D.icon('library'), h('span', { class: 'topbar-chip-text' }, ''));
    const title = h('h1', null, VIEW_TITLES.table);
    const topbar = h('header', { class: 'topbar' },
      h('div', { class: 'topbar-side' },
        title,
        h('span', { class: 'topbar-subtitle' }, 'בסגנון בר-אילן')),
      h('div', { class: 'topbar-side topbar-end' },
        scopeChip,
        h('button', { type: 'button', class: 'topbar-btn', title: 'עזרה', 'aria-label': 'עזרה', onclick: function () { app.openDialog('help'); } }, D.icon('help'))));

    const rail = h('nav', { class: 'rail', 'aria-label': 'סוג החיפוש' },
      railButton('free', 'chat', 'ניסוח חופשי', 'חיפוש בניסוח חופשי ≈ (נפתח בחיפוש של אוצריא)'),
      railButton('easy', 'flash', 'חיפוש קל'),
      railButton('table', 'table', 'חיפוש טבלאי'),
      railButton('advanced', 'code', 'חיפוש מתקדם'),
      h('div', { class: 'rail-divider', role: 'separator' }),
      railButton('corpus', 'library', 'המאגרים', 'המאגרים המשתתפים'));

    const formHost = h('div', { class: 'form-host' });
    const center = h('main', { class: 'center', id: 'center' }, formHost);
    const actions = h('div', { class: 'actions', role: 'toolbar', 'aria-label': 'פעולות' });
    const body = h('div', { class: 'frame' }, rail, center, actions);
    const shell = h('div', { class: 'app-shell' }, topbar, body);
    document.getElementById('root').appendChild(shell);
    els = { title, scopeChip, rail, formHost, center, actions, body };
  }

  function actionList(view) {
    const cancel = {
      label: 'ביטול',
      title: app.results ? 'חזרה לתוצאות בלי לשנות' : 'אין תוצאות לחזור אליהן',
      disabled: !app.results,
      onclick: function () { switchView('results'); },
    };
    const help = { label: 'עזרה', icon: 'help', onclick: function () { app.openDialog('help'); } };
    const history = { label: 'שאילתות קודמות', icon: 'history', group: 2, onclick: function () { app.openDialog('history'); } };
    const saved = { label: 'חיפושים שמורים', icon: 'star', group: 2, onclick: function () { app.openDialog('saved'); } };
    const families = { label: 'משפחות', icon: 'family', group: 2, onclick: function () { app.openDialog('families'); } };
    const examples = { label: 'דוגמאות להרחבת מרכיב החיפוש', icon: 'bulb', group: 3, onclick: function () { app.openDialog('examples'); } };
    if (view === 'easy') return [cancel, help, history];
    if (view === 'free') return [cancel, help];
    return [cancel, help, history, saved, families, examples];
  }

  function renderActions() {
    const view = app.state.view;
    const box = D.clear(els.actions);
    els.body.classList.toggle('no-actions', view === 'results');
    if (view === 'results') return;
    box.appendChild(D.button(view === 'free' ? 'פתח באוצריא' : 'בצע חיפוש', {
      variant: 'filled',
      icon: 'search',
      class: 'primary-action',
      title: 'Enter',
      onclick: function () { app.runSearch(); },
    }));
    const list = actionList(view);
    let group = 1;
    list.forEach(function (a) {
      if ((a.group || 1) !== group) {
        group = a.group || 1;
        box.appendChild(h('span', { class: 'actions-gap' }));
      }
      box.appendChild(D.button(a.label, { title: a.title, disabled: a.disabled, onclick: a.onclick, class: 'secondary' + (a.group === 3 ? ' multiline' : '') }));
    });
    const more = D.iconButton('expand', 'עוד פעולות', function () {
      Dlg.openMenu(more, list.map(function (a) {
        return { label: a.label, icon: a.icon, disabled: a.disabled, onclick: a.onclick };
      }));
    }, 'more-btn');
    box.appendChild(more);
  }

  function renderRail() {
    const active = app.state.view === 'results' ? app.state.formView : app.state.view;
    Array.prototype.forEach.call(els.rail.querySelectorAll('.rail-btn'), function (btn) {
      const on = btn.dataset.view === active;
      btn.classList.toggle('active', on);
      if (on) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
  }

  function renderScopeChip() {
    const scope = app.state.scope;
    const text = app.state.options.searchAll ? 'כל המאגרים' : Corpus.describeScope(scope);
    els.scopeChip.querySelector('.topbar-chip-text').textContent = 'היקף: ' + text;
    els.scopeChip.title = 'המאגרים המשתתפים – ' + text;
  }

  // ── views ──────────────────────────────────────────────────────────────────

  function buildViews() {
    views.table = root.BITableView.createTableView(app);
    views.distances = root.BIDistancesView.createDistancesView(app);
    views.props = root.BIPropsView.createPropsView(app);
    views.tableSearchProps = root.BIPropsView.createSearchPropsCard(app);
    views.easy = root.BIFormViews.createEasyView(app);
    views.advanced = root.BIFormViews.createAdvancedView(app);
    views.free = root.BIFormViews.createFreeView(app);
    views.results = root.BIResultsView.createResultsView(app);
    views.preview = createPreview();
    views.tablePage = {
      el: h('div', { class: 'form-stack table-page' },
        views.table.el,
        views.distances.el,
        h('div', { class: 'props-row' }, views.props.el, views.tableSearchProps.el)),
      refresh: function () {
        views.table.refresh();
        views.distances.refresh();
        views.props.refresh();
        views.tableSearchProps.refresh();
      },
      focusFirst: function () { views.table.focusField(app.state.focus.col, app.state.focus.row); },
    };
  }

  function pageFor(view) {
    if (view === 'table') return views.tablePage;
    return views[view];
  }

  function refreshForm() {
    const page = pageFor(app.state.view);
    if (page && page.refresh && app.state.view !== 'results') page.refresh();
    renderScopeChip();
  }

  function switchView(view, opts) {
    const o = opts || {};
    if (view !== 'results') app.state.formView = view;
    app.state.view = view;
    els.title.textContent = VIEW_TITLES[view];
    const host = D.clear(els.formHost);
    host.appendChild(pageFor(view).el);
    if (view !== 'results') host.appendChild(views.preview.el);
    els.body.classList.toggle('results-mode', view === 'results');
    renderRail();
    renderActions();
    refreshForm();
    views.preview.refresh();
    if (!o.noFocus) {
      if (view === 'results') views.results.focusFirst();
      else pageFor(view).focusFirst();
    }
    els.center.scrollTop = 0;
    scheduleRestore();
  }

  // ── search ─────────────────────────────────────────────────────────────────

  function historyEntry(built) {
    const entry = { view: built.view, syntax: built.syntax, text: built.view === 'table' ? '' : built.text };
    if (built.view === 'table') entry.query = M.cloneQuery(app.state.table);
    if (built.view === 'easy') entry.easy = Object.assign({}, app.state.easy);
    entry.options = pickOptions();
    return entry;
  }

  function openTab(tab, autoSearch) {
    return Host.call('reader.openSearchTab', Object.assign({ autoSearch: autoSearch !== false }, tab))
      .catch(function (error) { Host.notifyError(Host.describeError(error)); });
  }

  app.runSearch = function () {
    const st = app.state;
    if (st.formView === 'free') {
      const text = st.free.text.trim();
      if (!text) { Host.notifyError('יש להקליד שאלה.'); return; }
      Store.addHistory({ view: 'free', syntax: text, text });
      openTab({ query: text }, false);
      return;
    }
    const built = buildCurrent();
    views.preview.refresh();
    if (!built.result.ok) {
      Host.notifyError(built.result.errors[0] || 'השאילתה אינה תקינה.');
      return;
    }
    Store.addHistory(historyEntry(built));
    if (built.result.route === 'regex') {
      openTab(built.result.tab, true).then(function () {
        Host.notify('השאילתה עם התווים הכלליים נפתחה בחיפוש של אוצריא.');
      });
      return;
    }
    app.results = {
      request: { built: historyEntry(built), syntax: built.syntax, view: built.view },
      filter: null,
    };
    startResults(0);
  };

  /** (Re)compiles the request behind the results with paging and filter. */
  function compileResults(offset) {
    const res = app.results;
    const saved = snapshotForm();
    applyEntryToForm(res.request.built, true);
    const ctx = { includeBookCounts: true, offset, limit: app.state.pageSize, order: app.state.order };
    if (res.filter) ctx.scope = res.filter.scope;
    const prevSearchAll = app.state.options.searchAll;
    if (res.filter) app.state.options.searchAll = false;
    const built = buildCurrent(ctx);
    app.state.options.searchAll = prevSearchAll;
    restoreForm(saved);
    return built;
  }

  function startResults(offset) {
    const built = compileResults(offset);
    const res = app.results;
    Object.assign(res, {
      total: null, truncated: false, bookCounts: res.keepCounts ? res.bookCounts : null,
      offset, limit: app.state.pageSize, running: true, error: null,
      warnings: built.result.warnings, compiled: built.result, keepCounts: false,
    });
    if (!built.result.ok) {
      res.running = false;
      res.error = built.result.errors[0];
    }
    if (app.state.view !== 'results') switchView('results', { noFocus: true });
    views.results.reset();
    if (!built.result.ok) return;
    session.start(built.result.params, {
      onMeta: function (meta) {
        res.total = meta.total;
        res.truncated = meta.truncated;
        if (meta.bookCounts) res.bookCounts = meta.bookCounts;
        views.results.refreshMeta();
      },
      onResults: function (items) { views.results.appendHits(items); },
      onDone: function () {
        res.running = false;
        if (res.total == null) res.total = 0;
        views.results.done();
        if (res.bookCounts && !root.BILibrary.isLoaded()) {
          root.BILibrary.loadTree().then(function () { views.results.renderBooks(); }, function () {});
        }
        scheduleRestore();
      },
      onError: function (error) {
        res.running = false;
        res.error = Host.describeError(error);
        views.results.done();
      },
    });
    scheduleRestore();
  }

  app.stopSearch = function () {
    session.cancel();
    if (app.results) {
      app.results.running = false;
      views.results.done();
    }
  };

  app.goToPage = function (offset) {
    if (!app.results) return;
    app.results.keepCounts = true;
    startResults(offset);
    els.center.scrollTop = 0;
  };

  app.setResultsPrefs = function (patch) {
    if (patch.order) app.state.order = patch.order;
    if (patch.pageSize) app.state.pageSize = patch.pageSize;
    Store.setPrefs({ order: app.state.order, pageSize: app.state.pageSize });
    if (app.results) startResults(0);
  };

  app.setResultsFilter = function (filter) {
    if (!app.results) return;
    if (filter && filter.scope.categories) {
      filter.scope = narrowCategory(filter.scope.categories[0]);
    }
    if (filter) filter.scope.eras = app.state.scope.eras.slice();
    app.results.filter = filter;
    startResults(0);
  };

  /** Category filter intersected with the user's corpus selection. */
  function narrowCategory(cat) {
    const scope = app.state.scope;
    if (app.state.options.searchAll || scope.all) return { all: false, categories: [cat], books: [] };
    const inside = function (p) { return p === cat || p.indexOf(cat + '/') === 0; };
    const covering = scope.categories.some(function (p) { return cat === p || cat.indexOf(p + '/') === 0; });
    if (covering) return { all: false, categories: [cat], books: [] };
    return {
      all: false,
      categories: scope.categories.filter(inside),
      books: scope.books.filter(function (b) {
        const c = root.BILibrary.categoryOf(b);
        return c && inside(c);
      }),
    };
  }

  app.editSearch = function () {
    session.cancel();
    if (app.results) app.results.running = false;
    switchView(app.state.formView);
  };

  app.newSearch = function () {
    session.cancel();
    const view = app.state.formView;
    if (view === 'table') {
      app.state.table = M.createEmptyQuery();
      app.state.focus = { col: 0, row: 0 };
    } else if (view === 'easy') app.state.easy.text = '';
    else if (view === 'advanced') app.state.advanced.text = '';
    else app.state.free.text = '';
    if (app.results) app.results.running = false;
    switchView(view);
  };

  app.openHit = function (hit, side) {
    const compiled = app.results && app.results.compiled;
    const payload = {
      bookId: hit.bookId,
      index: hit.index,
      navigateToPositionIfReused: true,
      openInSidePane: !!side,
    };
    if (hit.id != null) payload.id = hit.id;
    if (hit.type) payload.type = hit.type;
    if (compiled && compiled.params) payload.searchQuery = compiled.params.query;
    Host.call('reader.openBook', payload).then(function (ok) {
      if (ok === false) Host.notifyError('הספר לא נמצא.');
    }, function (error) { Host.notifyError(Host.describeError(error)); });
  };

  app.openCurrentInOtzaria = function () {
    const compiled = app.results && app.results.compiled;
    if (compiled && compiled.tab) openTab(compiled.tab, true);
  };

  app.saveCurrentSearch = function () {
    const fromResults = app.state.view === 'results' && app.results;
    const entry = fromResults ? Object.assign({}, app.results.request.built) : null;
    const built = fromResults ? null : buildCurrent();
    if (!fromResults && !built.result.ok) {
      Host.notifyError(built.result.errors[0] || 'אין שאילתה לשמירה.');
      return Promise.resolve();
    }
    const base = entry || historyEntry(built);
    return Dlg.prompt('שמירת חיפוש', 'שם החיפוש', base.syntax.slice(0, 40)).then(function (name) {
      if (!name) return;
      Store.saveSearch(Object.assign({}, base, {
        name,
        scope: JSON.parse(JSON.stringify(app.state.scope)),
        total: fromResults && app.results.total != null ? app.results.total : null,
      }));
      Host.notify('החיפוש נשמר.');
    });
  };

  // ── loading entries (history / saved) into the forms ───────────────────────

  function snapshotForm() {
    return JSON.stringify({
      formView: app.state.formView, table: app.state.table, easy: app.state.easy,
      advanced: app.state.advanced, free: app.state.free, options: app.state.options,
    });
  }

  function restoreForm(snapshot) {
    Object.assign(app.state, JSON.parse(snapshot));
  }

  function applyEntryToForm(entry, quiet) {
    const st = app.state;
    st.formView = entry.view || 'table';
    if (entry.view === 'table') {
      st.table = entry.query ? M.fitToTable(entry.query) : M.fitToTable((S.parse(entry.syntax).query) || M.createEmptyQuery());
      if (!quiet) st.focus = { col: 0, row: 0 };
    } else if (entry.view === 'easy') {
      st.easy = Object.assign({}, st.easy, entry.easy || {}, { text: entry.text || '' });
    } else if (entry.view === 'advanced') {
      st.advanced = { text: entry.text || entry.syntax || '' };
    } else if (entry.view === 'free') {
      st.free = { text: entry.text || '' };
    }
    if (entry.options) st.options = Object.assign({}, st.options, entry.options);
  }

  app.loadEntry = function (entry, opts) {
    if (!entry) return;
    applyEntryToForm(entry, false);
    if (entry.scope) app.setScope(entry.scope, true);
    switchView(app.state.formView, { noFocus: !!(opts && opts.run) });
    if (opts && opts.run) app.runSearch();
  };

  app.historyFor = function (view) {
    return Store.data.history.filter(function (e) { return e.view === view; });
  };

  // ── dialogs and inserts ────────────────────────────────────────────────────

  app.openDialog = function (name) {
    if (name === 'history') Dialogs.openHistory(app);
    else if (name === 'saved') Dialogs.openSaved(app);
    else if (name === 'families') Dialogs.openFamilies(app);
    else if (name === 'examples') Dialogs.openExamples(app);
    else if (name === 'help') Dialogs.openHelp(app);
    else if (name === 'niqqud') Dialogs.openNiqqud(app);
    else if (name === 'corpus') Corpus.openCorpus(app);
  };

  app.openKeyboard = function (anchor, input) {
    const target = input || app.lastInput;
    Dialogs.openKeyboard(anchor, function () { return input || app.lastInput || target; });
  };

  app.searchOptions = function () {
    if (!optionsPromise) {
      optionsPromise = Host.call('search.getOptions', {}).catch(function () {
        optionsPromise = null;
        return { eras: [] };
      });
    }
    return optionsPromise;
  };

  app.setScope = function (scope, quiet) {
    app.state.scope = Corpus.normalizeScope(JSON.parse(JSON.stringify(scope)));
    Store.setPrefs({ scope: app.state.scope });
    if (!app.state.scope.all && app.state.options.searchAll) {
      app.state.options.searchAll = false;
      Store.setPrefs({ options: pickOptions() });
    }
    renderScopeChip();
    if (!quiet) refreshForm();
    schedulePreview();
  };

  function setFocusedText(text, extraFlags) {
    if (app.state.formView !== 'table') switchView('table');
    const field = app.focusedField();
    field.text = text;
    (extraFlags || []).forEach(function (f) { if (field.flags.indexOf(f) === -1) field.flags.push(f); });
    app.changed('flags');
    views.table.refresh();
    views.table.focusField(app.state.focus.col, app.state.focus.row);
  }

  app.insertFamily = function (name) {
    if (app.state.formView === 'advanced' && views.advanced.input) {
      D.insertAtCaret(views.advanced.input, '<' + name + '> ');
      return;
    }
    setFocusedText(name, ['ה']);
  };

  app.insertExample = function (text) {
    const view = app.state.formView;
    if (view === 'table') setFocusedText(text);
    else if (pageFor(view).input) D.insertAtCaret(pageFor(view).input, text);
  };

  app.applyNiqqud = function (text, niqqud, taamim) {
    if (app.state.formView !== 'table') {
      if (pageFor(app.state.formView).input) D.insertAtCaret(pageFor(app.state.formView).input, text);
      return;
    }
    const field = app.focusedField();
    field.text = text;
    [['ניקוד', niqqud], ['טעמים', taamim]].forEach(function (pair) {
      const has = field.flags.indexOf(pair[0]) !== -1;
      if (has !== pair[1]) M.toggleFlag(field, pair[0]);
    });
    app.changed('flags');
    views.table.refresh();
  };

  // ── tab restore ────────────────────────────────────────────────────────────

  const scheduleRestore = D.debounce(function () {
    const st = app.state;
    const state = {
      schemaVersion: RESTORE_SCHEMA,
      view: st.view,
      formView: st.formView,
      table: st.table,
      focus: st.focus,
      easy: st.easy,
      advanced: st.advanced,
      free: st.free,
      options: st.options,
      results: app.results ? { request: app.results.request, offset: app.results.offset, filter: app.results.filter } : null,
    };
    Host.call('plugin.setRestoreState', { state }).catch(function () {});
  }, 500);

  function applyRestore(saved) {
    if (!saved || saved.schemaVersion !== RESTORE_SCHEMA) return null;
    const st = app.state;
    st.table = M.fitToTable(saved.table);
    st.formView = ['table', 'easy', 'advanced', 'free'].indexOf(saved.formView) !== -1 ? saved.formView : 'table';
    if (saved.focus && saved.focus.col < M.TABLE_COLUMNS && saved.focus.row < M.TABLE_ROWS) st.focus = saved.focus;
    if (saved.easy) st.easy = Object.assign(st.easy, saved.easy);
    if (saved.advanced) st.advanced = { text: String(saved.advanced.text || '') };
    if (saved.free) st.free = { text: String(saved.free.text || '') };
    if (saved.options) st.options = Object.assign(st.options, saved.options);
    if (saved.view === 'results' && saved.results && saved.results.request) return saved.results;
    return null;
  }

  // ── boot ───────────────────────────────────────────────────────────────────

  function applyPrefs() {
    const prefs = Store.data.prefs || {};
    if (prefs.scope) app.state.scope = Corpus.normalizeScope(prefs.scope);
    if (prefs.options) app.state.options = Object.assign(app.state.options, prefs.options);
    if (prefs.order) app.state.order = prefs.order;
    if ([50, 100, 200, 500].indexOf(prefs.pageSize) !== -1) app.state.pageSize = prefs.pageSize;
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && !Dlg.isOpen() && app.results && app.results.running) {
      app.stopSearch();
    }
  });

  let booted = false;
  async function boot(payload) {
    if (booted) return;
    booted = true;
    root.BITheme.applyTheme(payload && payload.theme);
    await Store.load();
    applyPrefs();
    buildFrame();
    buildViews();
    const restoredResults = applyRestore(payload && payload.restore && payload.restore.state);
    switchView(app.state.formView);
    if (restoredResults) {
      app.results = { request: restoredResults.request, filter: restoredResults.filter || null };
      startResults(restoredResults.offset || 0);
    }
  }

  Host.on('plugin.boot', boot);
  Host.on('theme.changed', function (theme) { root.BITheme.applyTheme(theme); });
  Host.on('plugin.suspended', function () { scheduleRestore(); });

  root.BIApp = app;
})(window);
