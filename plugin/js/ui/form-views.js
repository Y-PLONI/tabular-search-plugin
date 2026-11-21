/*
 * The single-line forms: חיפוש קל, חיפוש מתקדם (Bar-Ilan syntax line) and
 * חיפוש בניסוח חופשי (not available in Otzaria; hands over to its search tab).
 */
(function (root) {
  'use strict';

  const D = root.BIDom;
  const h = D.h;
  const P = root.BIPropsView;

  /** [keyboard][input][history ▾][ניקוי] – the Bar-Ilan input row. */
  function inputRow(app, opts) {
    const input = h('input', {
      class: 'input line-input',
      type: 'text',
      dir: 'rtl',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': opts.label,
      placeholder: opts.placeholder || '',
      value: opts.get(),
      oninput: function () { opts.set(input.value); app.changed(opts.view); },
      onkeydown: function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          opts.onEnter();
        }
      },
      onfocus: function () { app.setLineFocus(input); },
    });
    const historyButton = D.iconButton('chevron', 'שאילתות קודמות בטופס זה', function () {
      const items = app.historyFor(opts.view).slice(0, 15).map(function (entry) {
        return { label: entry.text || entry.syntax, onclick: function () { setValue(entry.text || entry.syntax); } };
      });
      root.BIDialog.openMenu(historyButton, items.length ? items : [{ label: 'אין שאילתות קודמות', disabled: true, onclick: function () {} }]);
    });
    function setValue(value) {
      input.value = value;
      opts.set(value);
      app.changed(opts.view);
      input.focus();
    }
    const row = h('div', { class: 'line-row' },
      D.iconButton('keyboard', 'מקלדת עברית', function (event) { app.openKeyboard(event.currentTarget, input); }),
      input,
      historyButton,
      D.button('ניקוי', { onclick: function () { setValue(''); } }));
    return { row, input, setValue };
  }

  // ── חיפוש קל ─────────────────────────────────────────────────────────────

  function createEasyView(app) {
    const s = function () { return app.state.easy; };
    const line = inputRow(app, {
      view: 'easy',
      label: 'המילים לחיפוש',
      get: function () { return s().text; },
      set: function (v) { s().text = v; },
      onEnter: function () { app.runSearch(); },
    });

    function radio(value, label) {
      const input = h('input', {
        type: 'radio',
        name: 'easy-mode',
        onchange: function () { s().withAdditions = value; app.changed('easy'); refresh(); },
      });
      return { input, el: h('label', { class: 'radio' }, input, h('span', null, label)) };
    }
    function check(key, label) {
      const input = h('input', {
        type: 'checkbox',
        onchange: function () { s()[key] = input.checked; app.changed('easy'); },
      });
      return { input, el: h('label', { class: 'checkbox' }, input, h('span', null, label)) };
    }
    const plain = radio(false, 'חיפוש המילים ללא תוספות');
    const extra = radio(true, 'חיפוש המילים עם תוספות');
    const prefix = check('prefixFirst', 'קידומות דקדוקיות למילה הראשונה');
    const distance = check('distance', 'מרחק של עד 2 מילים בין מילות החיפוש');
    const plene = check('plene', 'מילים שיוקלדו בכתיב מלא (עם ו\' או י\') יתקבלו גם בלעדיהן');
    const searchAll = P.searchAllCheck(app);

    const el = h('div', { class: 'form-stack' },
      h('section', { class: 'card' },
        h('label', { class: 'line-label' }, 'הקלד את המילים שברצונך לחפש:'),
        line.row),
      h('section', { class: 'card', 'aria-label': 'מאפייני השאילתה' },
        h('h3', { class: 'card-title' }, 'מאפייני השאילתה'),
        h('div', { class: 'check-col' },
          plain.el,
          extra.el,
          h('div', { class: 'check-col indent' }, prefix.el, distance.el, plene.el),
          h('hr', { class: 'rule' }),
          searchAll.el)),
      h('section', { class: 'card example-card', 'aria-label': 'דוגמא' },
        h('h3', { class: 'card-title' }, 'דוגמא'),
        h('p', null, 'אם נחפש "נר חנוכה" ונסמן את כל שלושת הריבועים, נקבל גם:'),
        h('p', { class: 'example-text' }, 'נר ראשון של חנוכה, בנר חנוכה, בנר של חנוכה וכו\'')));

    function refresh() {
      const st = s();
      if (document.activeElement !== line.input) line.input.value = st.text;
      plain.input.checked = !st.withAdditions;
      extra.input.checked = !!st.withAdditions;
      [[prefix, 'prefixFirst'], [distance, 'distance'], [plene, 'plene']].forEach(function (pair) {
        pair[0].input.checked = !!st[pair[1]];
        pair[0].input.disabled = !st.withAdditions;
        pair[0].el.classList.toggle('disabled', !st.withAdditions);
      });
      searchAll.refresh();
    }

    return { el, refresh, focusFirst: function () { line.input.focus(); }, input: line.input };
  }

  // ── חיפוש מתקדם ──────────────────────────────────────────────────────────

  /** Bar-Ilan operator buttons in their 3-column order (read right-to-left). */
  const OPERATORS = [
    { op: '#', kind: 'prefix', label: 'קידומות דיקדוקיות' },
    { op: '*', kind: 'prefix', label: 'קידומות' },
    { op: '-', kind: 'prefix', label: 'שלילת המרכיב' },
    { op: '#', kind: 'suffix', label: 'סיומות דיקדוקיות' },
    { op: '*', kind: 'suffix', label: 'סיומות' },
    { op: '<>', kind: 'wrap', label: 'משפחה' },
    { op: '!', kind: 'prefix', label: 'כתיב מלא/חסר' },
    { op: '', kind: 'strip', label: 'ללא אפיון' },
    { op: '{}', kind: 'disabled', label: 'חיפוש שמור', title: 'אוצריא אינה יכולה להשתמש בתוצאות של חיפוש קודם כמרכיב.' },
    { op: '+', kind: 'prefix', label: 'עם/בלי גרשיים' },
    { op: '$', kind: 'prefix', label: 'ערך ≈', title: '≈ לאוצריא אין מילון ערכים: קידומות וסיומות דקדוקיות וכתיב מלא/חסר.' },
    { op: '%', kind: 'prefix', label: 'שורש ≈', title: '≈ לאוצריא אין ניתוח שורשים: קידומות וסיומות דקדוקיות וכתיב מלא/חסר.' },
    { op: '^', kind: 'prefix', label: 'תרגום לארמית' },
  ];
  const PREFIX_CHARS = '-#*!+$%^';

  /** Applies an operator to the space-separated token under the caret. */
  function applyOperator(text, caret, operator) {
    let start = text.lastIndexOf(' ', Math.max(0, caret - 1)) + 1;
    if (caret > 0 && text[caret - 1] === ' ') start = caret;
    let end = text.indexOf(' ', caret);
    if (end === -1) end = text.length;
    let token = text.slice(start, end);
    let prefix = '';
    while (token && PREFIX_CHARS.indexOf(token[0]) !== -1 && token.length > 1) {
      prefix += token[0];
      token = token.slice(1);
    }
    let suffix = '';
    while (token.length > 1 && (token.endsWith('#') || token.endsWith('*'))) {
      suffix = token.slice(-1) + suffix;
      token = token.slice(0, -1);
    }
    if (operator.kind === 'prefix') {
      prefix = prefix.indexOf(operator.op) !== -1 ? prefix.replace(operator.op, '') : prefix + operator.op;
    } else if (operator.kind === 'suffix') {
      suffix = suffix.indexOf(operator.op) !== -1 ? suffix.replace(operator.op, '') : suffix + operator.op;
    } else if (operator.kind === 'wrap') {
      token = /^<.*>$/.test(token) ? token.slice(1, -1) : '<' + token + '>';
    } else if (operator.kind === 'strip') {
      prefix = '';
      suffix = '';
      token = token.replace(/^<|>$/g, '');
    }
    const replaced = prefix + token + suffix;
    return {
      text: text.slice(0, start) + replaced + text.slice(end),
      caret: start + (token ? replaced.length : prefix.length),
    };
  }

  function createAdvancedView(app) {
    const s = function () { return app.state.advanced; };
    const line = inputRow(app, {
      view: 'advanced',
      label: 'שאילתה בתחביר בר-אילן',
      placeholder: 'למשל: 8: ($שומר/%מצא) #(אכל/גנב/מכר)',
      get: function () { return s().text; },
      set: function (v) { s().text = v; },
      onEnter: function () { app.runSearch(); },
    });

    const opGrid = h('div', { class: 'op-grid' });
    OPERATORS.forEach(function (operator) {
      opGrid.appendChild(h('button', {
        type: 'button',
        class: 'flag-btn',
        disabled: operator.kind === 'disabled',
        title: operator.title || operator.label,
        onmousedown: function (event) { event.preventDefault(); },
        onclick: function () {
          const input = line.input;
          const caret = input.selectionStart == null ? input.value.length : input.selectionStart;
          const result = applyOperator(input.value, caret, operator);
          input.value = result.text;
          s().text = result.text;
          input.focus();
          input.setSelectionRange(result.caret, result.caret);
          app.changed('advanced');
        },
      }, h('span', { class: 'flag-key' }, operator.op), h('span', { class: 'flag-name' }, operator.label)));
    });

    const props = P.createSearchPropsCard(app);
    const el = h('div', { class: 'form-stack' },
      h('section', { class: 'card' },
        h('label', { class: 'line-label' }, 'הקלד את המילים שברצונך לחפש:'),
        line.row,
        h('p', { class: 'hint' },
          'מרחקים: ', h('code', { dir: 'rtl' }, 'נר [4:1] שבת'), ' (עד 4 מקומות קדימה), ',
          h('code', { dir: 'rtl' }, 'חכמים [1:1-] תקנו'), ' (בכל סדר). טווח: ',
          h('code', { dir: 'rtl' }, '10: א ב'), '. תחום: ',
          h('code', { dir: 'rtl' }, 'פסקה: א ב'), '. חלופות: ',
          h('code', { dir: 'rtl' }, '(א/ב/ג)'), '.')),
      h('section', { class: 'card', 'aria-label': 'מאפייני המילה לחיפוש' },
        h('h3', { class: 'card-title' }, 'מאפייני המילה לחיפוש'),
        opGrid),
      props.el);

    function refresh() {
      if (document.activeElement !== line.input) line.input.value = s().text;
      props.refresh();
    }

    return { el, refresh, focusFirst: function () { line.input.focus(); }, input: line.input };
  }

  // ── חיפוש בניסוח חופשי ───────────────────────────────────────────────────

  function createFreeView(app) {
    const s = function () { return app.state.free; };
    const line = inputRow(app, {
      view: 'free',
      label: 'שאלה בניסוח חופשי',
      placeholder: 'האם יש חיוב לתרום כליה לחולה מסוכן',
      get: function () { return s().text; },
      set: function (v) { s().text = v; },
      onEnter: function () { app.runSearch(); },
    });
    const el = h('div', { class: 'form-stack' },
      h('section', { class: 'card' },
        h('label', { class: 'line-label' }, 'הקלד את השאלה שברצונך לחפש:'),
        line.row),
      h('section', { class: 'card notice' },
        h('h3', { class: 'card-title' }, 'מה קורה בחיפוש ≈'),
        h('p', null, 'לאוצריא אין חיפוש לפי משמעות כמו בבר-אילן. במקומו התוסף הופך את השאלה לחיפוש רגיל: ' +
          'מילות השאלה (בלי מילות שאלה ומילות קישור), כל אחת עם קידומות דקדוקיות וכתיב מלא/חסר, ' +
          'כולן באותה פסקה.'),
        h('p', null, 'החיפוש מוצג בטבלה (עד ארבע מילים) או בשורת החיפוש המתקדם (יותר מארבע). ' +
          'אחרי התוצאות, "ערוך חיפוש" פותח אותו לעריכה.')));
    function refresh() {
      if (document.activeElement !== line.input) line.input.value = s().text;
    }
    return { el, refresh, focusFirst: function () { line.input.focus(); }, input: line.input };
  }

  root.BIFormViews = { createEasyView, createAdvancedView, createFreeView, applyOperator };
})(window);
