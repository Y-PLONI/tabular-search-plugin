/*
 * "מרכיבי החיפוש": 4 columns × (main word + 3 "או" alternatives), laid out
 * right-to-left like Bar-Ilan, with property markers next to each field.
 */
(function (root) {
  'use strict';

  const M = root.BIModel;
  const D = root.BIDom;
  const h = D.h;

  /** Short badges for Otzaria-only options (Bar-Ilan letters show as-is). */
  const EXTRA_BADGES = {
    'חלק ממילה': 'חמ',
    'שגיאות כתיב': 'שכ',
    'קידומות ארמיות': 'קא',
    'סיומות ארמיות': 'סא',
    'ניקוד': 'נק',
    'טעמים': 'טע',
  };

  function badgeText(flag) {
    return EXTRA_BADGES[flag] || flag;
  }

  function createTableView(app) {
    const inputs = []; // inputs[col][row]
    const markerBoxes = [];
    const columnEls = [];

    const grid = h('div', { class: 'comp-grid' });
    const orColumn = h('div', { class: 'comp-or', 'aria-hidden': 'true' },
      h('div', { class: 'comp-head' }, ''));
    for (let r = 0; r < M.TABLE_ROWS; r++) {
      orColumn.appendChild(h('div', { class: 'comp-or-cell' }, r === 0 ? '' : 'או'));
    }
    grid.appendChild(orColumn);

    for (let c = 0; c < M.TABLE_COLUMNS; c++) {
      if (c > 0) {
        grid.appendChild(h('div', { class: 'comp-and', 'aria-hidden': 'true' },
          h('div', { class: 'comp-head' }, 'וגם'),
          h('div', { class: 'comp-and-rule' })));
      }
      inputs[c] = [];
      markerBoxes[c] = [];
      const column = h('div', { class: 'comp-col', role: 'group', 'aria-label': 'מרכיב ' + (c + 1) },
        h('div', { class: 'comp-head' }, 'מרכיב ' + (c + 1)));
      for (let r = 0; r < M.TABLE_ROWS; r++) {
        column.appendChild(createField(c, r));
      }
      column.appendChild(h('div', { class: 'comp-foot' }, 'טור ' + (c + 1)));
      columnEls.push(column);
      grid.appendChild(column);
    }

    function createField(c, r) {
      const label = r === 0 ? 'מרכיב ' + (c + 1) : 'מרכיב ' + (c + 1) + ', חלופה ' + r;
      const input = h('input', {
        class: 'input comp-input' + (r === 0 ? ' main' : ''),
        type: 'text',
        dir: 'rtl',
        autocomplete: 'off',
        spellcheck: 'false',
        'aria-label': label,
        placeholder: r === 0 ? '' : 'או…',
      });
      input.addEventListener('input', function () {
        app.state.table.columns[c].fields[r].text = input.value;
        app.changed('table');
        refreshField(c, r);
      });
      input.addEventListener('focus', function () {
        app.setFocus(c, r, input);
      });
      input.addEventListener('keydown', function (event) { onKey(event, c, r); });
      const markers = h('span', { class: 'markers' });
      inputs[c][r] = input;
      markerBoxes[c][r] = markers;
      return h('div', { class: 'comp-field' }, input, markers);
    }

    function onKey(event, c, r) {
      if (event.key === 'Enter') {
        event.preventDefault();
        app.runSearch();
        return;
      }
      if (event.altKey && !event.ctrlKey && M.FLAGS[event.key]) {
        event.preventDefault();
        app.toggleFlag(event.key);
        return;
      }
      let target = null;
      if (event.key === 'ArrowDown' && r < M.TABLE_ROWS - 1) target = [c, r + 1];
      else if (event.key === 'ArrowUp' && r > 0) target = [c, r - 1];
      else if (event.key === 'Tab') {
        // Bar-Ilan moves row by row: 1→2→3→4 on the same row, then the next row.
        const flat = r * M.TABLE_COLUMNS + c + (event.shiftKey ? -1 : 1);
        if (flat >= 0 && flat < M.TABLE_ROWS * M.TABLE_COLUMNS) {
          target = [flat % M.TABLE_COLUMNS, Math.floor(flat / M.TABLE_COLUMNS)];
        }
      }
      if (target) {
        event.preventDefault();
        inputs[target[0]][target[1]].focus();
        inputs[target[0]][target[1]].select();
      }
    }

    function refreshField(c, r) {
      const field = app.state.table.columns[c].fields[r];
      const input = inputs[c][r];
      if (input.value !== field.text) input.value = field.text;
      const kind = M.classifyText(field.text);
      input.classList.toggle('invalid', kind === 'invalid');
      input.classList.toggle('pattern', kind === 'pattern');
      input.title = kind === 'invalid'
        ? 'כל שדה מכיל מילה אחת בלבד (בלי רווח או מקף)'
        : kind === 'pattern' ? 'תווים כלליים – החיפוש ייפתח בחיפוש של אוצריא' : '';
      const box = D.clear(markerBoxes[c][r]);
      field.flags.forEach(function (flag) {
        const def = M.FLAGS[flag];
        const name = def ? def.name : flag;
        box.appendChild(h('button', {
          type: 'button',
          class: 'marker' + (flag === 'ל' ? ' negative' : '') + (def && def.status === 'approx' ? ' approx' : ''),
          title: name + ' – לחיצה מסירה',
          'aria-label': 'הסרת ' + name,
          tabindex: '-1',
          onclick: function () {
            M.toggleFlag(field, flag);
            app.changed('flags');
            refresh();
          },
        }, badgeText(flag)));
      });
    }

    function refresh() {
      for (let c = 0; c < M.TABLE_COLUMNS; c++) {
        const column = app.state.table.columns[c];
        for (let r = 0; r < M.TABLE_ROWS; r++) refreshField(c, r);
        const negated = column.fields.some(function (f) { return M.isFieldFilled(f) && f.flags.indexOf('ל') !== -1; });
        columnEls[c].classList.toggle('negated', negated);
        columnEls[c].classList.toggle('focused', app.state.focus.col === c);
      }
    }

    function clearAll() {
      app.state.table = M.createEmptyQuery();
      app.changed('table');
      refresh();
      focusFirst();
    }

    function focusFirst() {
      inputs[0][0].focus({ preventScroll: true });
    }

    function focusField(c, r) {
      const input = inputs[c] && inputs[c][r];
      if (input) input.focus({ preventScroll: true });
    }

    const toolbar = h('div', { class: 'comp-toolbar' },
      D.button('ניקוי הכל', { icon: 'erase', onclick: clearAll, title: 'ניקוי המילים, המאפיינים והמרחקים' }),
      D.button('ניקוד…', { icon: 'niqqud', onclick: function () { app.openDialog('niqqud'); } }),
      D.button('{{ביטוי}}', {
        disabled: true,
        title: 'ביטוי של כמה מילים כחלופה אחת אינו נתמך באוצריא. ' +
          'אפשר לסמן "כולל ראשי תיבות" או לחפש כל מילה במרכיב נפרד.',
      }),
      D.button('מקלדת', { icon: 'keyboard', onclick: function (e) { app.openKeyboard(e.currentTarget); } }),
      D.button('הצג ניקוד', {
        disabled: true,
        title: 'אין צורך: השדות מציגים את הניקוד כפי שהוקלד. לחיפוש לפי ניקוד – "ניקוד…".',
      }));

    const el = h('section', { class: 'card comp-card', 'aria-label': 'מרכיבי החיפוש' },
      h('h3', { class: 'card-title' }, 'מרכיבי החיפוש'),
      grid,
      toolbar);

    return { el, refresh, focusFirst, focusField, clearAll };
  }

  root.BITableView = { createTableView, badgeText };
})(window);
