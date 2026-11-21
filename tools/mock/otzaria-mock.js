/*
 * Development-only stand-in for window.Otzaria (never packaged: it lives
 * outside plugin/). Query string: ?theme=dark|light, ?fontsize=18
 * Inspect calls in the console via window.__mock.log.
 */
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const listeners = {};
  const log = [];
  const memory = {};

  const THEMES = {
    light: {
      mode: 'light',
      colorScheme: {
        primary: '#6B4F2A', onPrimary: '#FFFFFF', primaryContainer: '#F7DDB8', onPrimaryContainer: '#251900',
        secondary: '#6D5C48', onSecondary: '#FFFFFF', secondaryContainer: '#F7DFC6', onSecondaryContainer: '#261A0A',
        tertiary: '#516440', onTertiary: '#FFFFFF', tertiaryContainer: '#D3EABC', onTertiaryContainer: '#0F2004',
        surface: '#FFF8F3', onSurface: '#1F1B16', onSurfaceVariant: '#4F4539',
        surfaceContainerLowest: '#FFFFFF', surfaceContainerLow: '#FBF2EA', surfaceContainer: '#F5ECE4',
        surfaceContainerHigh: '#EFE7DE', surfaceContainerHighest: '#E9E1D9',
        error: '#BA1A1A', onError: '#FFFFFF', errorContainer: '#FFDAD6', onErrorContainer: '#410002',
        outline: '#817567', outlineVariant: '#D3C4B4', inverseSurface: '#352F2A', onInverseSurface: '#F9EFE7',
        inversePrimary: '#E2C08F', shadow: '#000000', scrim: '#000000', surfaceTint: '#6B4F2A',
      },
      surfaces: { reader: '#FFFBF6', panel: '#F8F1EA', card: '#FFFBF7', topBar: '#EFE7DE' },
    },
    dark: {
      mode: 'dark',
      colorScheme: {
        primary: '#E2C08F', onPrimary: '#3E2D04', primaryContainer: '#574319', onPrimaryContainer: '#FFDEAC',
        secondary: '#DAC3A8', onSecondary: '#3C2E1D', secondaryContainer: '#544432', onSecondaryContainer: '#F7DFC6',
        tertiary: '#B7CEA1', onTertiary: '#243516', tertiaryContainer: '#3A4C2A', onTertiaryContainer: '#D3EABC',
        surface: '#17130E', onSurface: '#EBE1D8', onSurfaceVariant: '#D3C4B4',
        surfaceContainerLowest: '#110D09', surfaceContainerLow: '#1F1B16', surfaceContainer: '#231F1A',
        surfaceContainerHigh: '#2E2924', surfaceContainerHighest: '#39342E',
        error: '#FFB4AB', onError: '#690005', errorContainer: '#93000A', onErrorContainer: '#FFDAD6',
        outline: '#9C8F80', outlineVariant: '#4F4539', inverseSurface: '#EBE1D8', onInverseSurface: '#352F2A',
        inversePrimary: '#6B4F2A', shadow: '#000000', scrim: '#000000', surfaceTint: '#E2C08F',
      },
      surfaces: { reader: '#1A1611', panel: '#1C1813', card: '#24201A', topBar: '#2E2924' },
    },
  };

  function theme(mode) {
    const base = THEMES[mode] || THEMES.light;
    return Object.assign({}, base, {
      typography: {
        fontFamily: 'Frank Ruhl Libre', fontSize: Number(params.get('fontsize') || 22), lineHeight: 1.5,
        commentatorsFontFamily: 'David', commentatorsFontSize: 18, uiFontFamily: 'Rubik',
        uiFont: "'Segoe UI', system-ui, sans-serif",
      },
      radius: 8,
      spacing: { '2xs': 2, xs: 4, sm: 8, smd: 12, md: 16, lg: 24, xl: 32 },
      density: { compact: false, topBarHeight: 56, fieldHeight: 48 },
    });
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach(function (cb) { cb(payload); });
  }

  // ── fake library ──
  let nextId = 1;
  function books(titles) { return titles.map(function (t) { return { id: nextId++, bookId: t, title: t, type: 'text' }; }); }
  const tree = {
    title: 'ספריית אוצריא', path: '/', books: [],
    categories: [
      { title: 'תנך', path: '/תנך', books: [], categories: [
        { title: 'תורה', path: '/תנך/תורה', categories: [], books: books(['בראשית', 'שמות', 'ויקרא', 'במדבר', 'דברים']) },
        { title: 'נביאים', path: '/תנך/נביאים', categories: [], books: books(['יהושע', 'שופטים', 'שמואל א']) },
      ] },
      { title: 'משנה', path: '/משנה', books: [], categories: [
        { title: 'סדר זרעים', path: '/משנה/סדר זרעים', categories: [], books: books(['משנה ברכות', 'משנה פאה']) },
        { title: 'סדר מועד', path: '/משנה/סדר מועד', categories: [], books: books(['משנה שבת', 'משנה עירובין']) },
      ] },
      { title: 'תלמוד בבלי', path: '/תלמוד בבלי', books: books(['ברכות', 'שבת', 'עירובין', 'פסחים']), categories: [] },
      { title: 'הלכה', path: '/הלכה', books: [], categories: [
        { title: 'משנה תורה', path: '/הלכה/משנה תורה', categories: [], books: books(['הלכות שבת', 'הלכות תפילה']) },
        { title: 'שולחן ערוך', path: '/הלכה/שולחן ערוך', categories: [], books: books(['שולחן ערוך אורח חיים', 'שולחן ערוך יורה דעה']) },
      ] },
      { title: 'שו"ת', path: '/שות', books: books(['שו"ת הרשב"א', 'שו"ת חתם סופר', 'שו"ת אגרות משה']), categories: [] },
    ],
  };
  const allBooks = [];
  (function walk(node) {
    (node.books || []).forEach(function (b) { allBooks.push(Object.assign({ categoryPath: node.path }, b)); });
    (node.categories || []).forEach(walk);
  })(tree);

  const SNIPPETS = [
    'ויאמר {0} אל {1} לאמר דבר אל בני ישראל ויקחו לי תרומה מאת כל איש אשר ידבנו לבו',
    'ומצאתי כתוב בשם רבינו ש{0} היה נוהג {1} בכל ערב שבת קודם השקיעה',
    'והנה {0} ו{1} שניהם אמת, אלא שזה בכה וזה בכה, ואין כאן מחלוקת כלל',
    'ועיין עוד בדברי הפוסקים שכתבו ד{0} אינו אלא מדרבנן ו{1} מן התורה',
  ];

  function fakeSearch(payload) {
    const words = String(payload.query || '').split(/\s+/).filter(Boolean);
    const seed = words.join('').length;
    const total = words.length ? (seed * 37) % 900 + 3 : 0;
    const limit = Math.min(payload.limit || 50, 500);
    const offset = payload.offset || 0;
    const count = Math.max(0, Math.min(limit, total - offset));
    let pool = allBooks;
    if (payload.books && payload.books.length) {
      pool = allBooks.filter(function (b) { return payload.books.some(function (x) { return x.id === b.id || x.bookId === b.bookId; }); });
    } else if (payload.categories && payload.categories.length) {
      pool = allBooks.filter(function (b) { return payload.categories.some(function (c) { return b.categoryPath.indexOf(c) === 0; }); });
    }
    if (!pool.length) pool = allBooks;
    const results = [];
    for (let i = 0; i < count; i++) {
      const n = offset + i;
      const book = pool[n % pool.length];
      const text = SNIPPETS[n % SNIPPETS.length]
        .replace('{0}', '<b>' + (words[0] || '') + '</b>')
        .replace('{1}', '<b>' + (words[1] || words[0] || '') + '</b>');
      results.push({
        id: book.id, bookId: book.bookId, type: 'text', source: 'library', book: book.title,
        categoryPath: book.categoryPath, reference: book.title + ', ' + ['פרק', 'סימן', 'דף'][n % 3] + ' ' + (n % 40 + 1),
        text: text + (words[2] ? ' ' + 'עוד '.repeat(n % 9) + '<b>' + words[2] + '</b>' : '') +
          (n % 7 === 0 ? '<script>alert(1)</script>' : ''), textStatus: n % 29 === 5 ? 'stale' : 'ok',
        index: n * 3, mergedCount: 1,
      });
    }
    const bookCounts = payload.includeBookCounts ? pool.map(function (b, i) {
      return { id: b.id, bookId: b.bookId, type: 'text', source: 'library', title: b.title, count: Math.max(1, Math.round(total / pool.length) + (i % 3)) };
    }) : undefined;
    return { total, results, bookCounts, limit, offset };
  }

  function searchStream(payload) {
    const data = fakeSearch(payload);
    const chunks = [{ sequence: 0, results: [], total: data.total, groupCount: null, truncated: data.total > 800, limit: data.limit, offset: data.offset, facets: [], bookCounts: data.bookCounts }];
    for (let i = 0; i < data.results.length; i += 50) {
      chunks.push({ sequence: chunks.length, results: data.results.slice(i, i + 50), total: data.total, groupCount: null, truncated: false, limit: data.limit, offset: data.offset, facets: [] });
    }
    let i = 0;
    let ended = false;
    const fail = params.get('fail') === 'search';
    return {
      next: function () {
        return new Promise(function (resolve, reject) {
          setTimeout(function () {
            if (ended || i >= chunks.length) { resolve({ value: undefined, done: true }); return; }
            if (fail && i === 1) { reject(new Error('error.timeout')); return; }
            resolve({ value: chunks[i++], done: false });
          }, i === 0 ? 300 : 80);
        });
      },
      return: function () { ended = true; log.push(['search.cancel']); return Promise.resolve({ done: true }); },
      [Symbol.asyncIterator]: function () { return this; },
    };
  }

  function ok(data) { return Promise.resolve({ success: true, data, error: null }); }

  function toast(text, kind) {
    const el = document.createElement('div');
    el.textContent = text;
    el.setAttribute('data-mock-toast', kind);
    el.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:999;padding:8px 14px;border-radius:8px;' +
      'background:' + (kind === 'error' ? '#8c1d18' : '#333') + ';color:#fff;font:14px system-ui;max-width:60vw';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  window.Otzaria = {
    call: function (method, payload) {
      log.push([method, JSON.parse(JSON.stringify(payload || {}))]);
      switch (method) {
        case 'search.query': return searchStream(payload || {});
        case 'search.fullText': {
          if (params.get('fail') === 'fulltext') return ok(null).then(function () { return { success: false, data: null, error: { code: 'error.forbidden', message: 'mock' } }; });
          const found = allBooks.slice(0, 9).map(function (b, i) {
            return { type: 'text', book: b.title, text: 'שורה לדוגמה עם <b>התאמה</b> לביטוי ' + payload.query, textStatus: 'ok', index: i * 7, continuesToNextLine: false };
          });
          return ok(found);
        }
        case 'search.getOptions': return ok({ modes: ['exact', 'advanced', 'fuzzy'], eras: ['חז"ל', 'ראשונים', 'אחרונים', 'מחברי זמננו'], maxLimit: 500 });
        case 'storage.get': return ok(memory[payload.key] === undefined ? null : memory[payload.key]);
        case 'storage.set': memory[payload.key] = payload.value; return ok(true);
        case 'storage.remove': delete memory[payload.key]; return ok(true);
        case 'storage.list': return ok(Object.keys(memory));
        case 'library.getTree': return new Promise(function (r) { setTimeout(function () { r({ success: true, data: tree }); }, 250); });
        case 'library.findBooks': return ok(allBooks.filter(function (b) { return b.title.indexOf(payload.query) !== -1; }).slice(0, payload.limit || 20));
        case 'reader.openSearchTab': toast('openSearchTab: ' + payload.query, 'info'); return ok(true);
        case 'reader.openBook': toast('openBook: ' + payload.bookId + ' @' + payload.index + (payload.openInSidePane ? ' (side)' : ''), 'info'); return ok(true);
        case 'ui.showMessage': toast(payload.message, 'info'); return ok(true);
        case 'ui.showError': toast(payload.message, 'error'); return ok(true);
        case 'ui.showConfirm': return ok({ confirmed: window.confirm(payload.content) });
        case 'plugin.setRestoreState': window.__mock.restoreState = payload.state; return ok(true);
        default: return Promise.resolve({ success: false, data: null, error: { code: 'error.not_found', message: 'mock: ' + method } });
      }
    },
    on: function (event, cb) { (listeners[event] = listeners[event] || []).push(cb); },
    off: function (event, cb) { listeners[event] = (listeners[event] || []).filter(function (x) { return x !== cb; }); },
  };

  window.__mock = {
    log,
    memory,
    setTheme: function (mode) { emit('theme.changed', theme(mode)); },
    restoreState: null,
  };

  window.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      let restore;
      const raw = params.get('restore');
      if (raw) {
        try { restore = { reason: 'reloaded', state: JSON.parse(raw) }; } catch (e) { restore = undefined; }
      }
      emit('plugin.boot', {
        plugin: { id: 'dev', version: '0.0.0' },
        app: { version: '0.9.99', platform: 'windows', locale: 'he-IL', textDirection: 'rtl', runMode: 'foreground' },
        theme: theme(params.get('theme') || 'light'),
        permissions: ['search.fulltext.read', 'reader.open', 'library.books.read'],
        restore,
      });
    }, 30);
  });
})();
