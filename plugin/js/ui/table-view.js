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
        // One word per cell, as in Bar-Ilan: whitespace from IME/autocorrect moves on.
        if (/\s/.test(input.value)) {
          spreadFrom(c, r, input.value, true);
          return;
        }
        app.state.table.columns[c].fields[r].text = input.value;
        app.changed('table');
        refreshField(c, r);
      });
      input.addEventListener('paste', function (event) {
        const text = event.clipboardData && event.clipboardData.getData('text');
        if (!text || !/\s/.test(text.trim())) return;
        event.preventDefault();
        const start = input.selectionStart == null ? input.value.length : input.selectionStart;
        const end = input.selectionEnd == null ? start : input.selectionEnd;
        spreadFrom(c, r, input.value.slice(0, start) + text + input.value.slice(end), false);
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

    /** Puts the words of `text` into this cell and the following ones (Bar-Ilan order). */
    function spreadFrom(c, r, text, typed) {
      const words = M.splitWords(text);
      const table = app.state.table;
      if (!words.length) {
        table.columns[c].fields[r].text = '';
      }
      const result = M.distributeWords(table, c, r, words);
      app.changed('table');
      refresh();
      if (result.dropped) {
        root.BIHost.notify(result.dropped + ' מילים לא נכנסו לטבלה (16 שדות לכל היותר).');
      }
      let target = result.last || { col: c, row: r };
      // A typed space at the end moves to the next, empty cell.
      if (typed && /\s$/.test(text)) target = M.nextCell(target.col, target.row, 1) || target;
      const input = inputs[target.col][target.row];
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }

    /** Space: never a space in the cell; move on, splitting the word at the caret if the next cell is empty. */
    function onSpace(event, c, r) {
      event.preventDefault();
      const next = M.nextCell(c, r, 1);
      if (!next) return;
      const input = inputs[c][r];
      const caret = input.selectionStart;
      const field = app.state.table.columns[c].fields[r];
      const nextField = app.state.table.columns[next.col].fields[next.row];
      const nextInput = inputs[next.col][next.row];
      if (caret > 0 && caret < input.value.length && input.selectionEnd === caret && !nextField.text) {
        nextField.text = input.value.slice(caret);
        field.text = input.value.slice(0, caret);
        app.changed('table');
        refreshField(c, r);
        refreshField(next.col, next.row);
        nextInput.focus();
        nextInput.setSelectionRange(0, 0);
        return;
      }
      nextInput.focus();
      nextInput.select();
    }

    function onKey(event, c, r) {
      if (event.key === ' ' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        onSpace(event, c, r);
        return;
      }
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
        const cell = M.nextCell(c, r, event.shiftKey ? -1 : 1);
        if (cell) target = [cell.col, cell.row];
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
      if (field.flags.length > 2) {
        // Many properties: one compact badge, like Bar-Ilan's letter string next to the field.
        const names = field.flags.map(M.flagLabel).join(', ');
        box.appendChild(h('button', {
          type: 'button',
          class: 'marker' + (field.flags.indexOf('ל') !== -1 ? ' negative' : ''),
          title: names + ' – לחיצה בוחרת את השדה',
          'aria-label': 'מאפיינים: ' + names,
          tabindex: '-1',
          onclick: function () { inputs[c][r].focus(); },
        }, field.flags.map(badgeText).join('')));
        return;
      }
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
