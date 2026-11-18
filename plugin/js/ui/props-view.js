/*
 * "מאפייני המרכיב לחיפוש" (the 4 × 4 letter grid, acting on the focused field
 * like Bar-Ilan), the Otzaria extras and "מאפייני החיפוש".
 */
(function (root) {
  'use strict';

  const M = root.BIModel;
  const D = root.BIDom;
  const h = D.h;

  function flagTitle(letter) {
    const def = M.FLAGS[letter];
    let title = def.name;
    if (def.note) title += '\n' + def.note;
    return title + '\nקיצור: Alt+' + letter;
  }

  function createPropsView(app) {
    const flagButtons = {};
    const extraButtons = {};
    const target = h('span', { class: 'card-hint' });

    const markAll = h('input', {
      type: 'checkbox',
      onchange: function () {
        app.state.markAll = markAll.checked;
        app.changed('ui');
      },
    });

    const grid = h('div', { class: 'flag-grid' });
    M.FLAG_GRID.forEach(function (row, r) {
      row.forEach(function (letter, c) {
        if (r === 3 && c === 3) {
          grid.appendChild(h('label', {
            class: 'checkbox flag-markall',
            title: 'המאפיין הבא שייבחר יחול על כל השדות המלאים',
          }, markAll, h('span', null, 'סימון כל הרכיבים')));
          return;
        }
        if (letter === null) {
          grid.appendChild(h('span', { class: 'flag-empty' }));
          return;
        }
        const def = letter === '' ? null : M.FLAGS[letter];
        const unsupported = def && def.status === 'unsupported';
        const button = h('button', {
          type: 'button',
          class: 'flag-btn' + (def && def.status === 'approx' ? ' approx' : ''),
          title: def ? (unsupported ? def.name + ' – ' + def.note : flagTitle(letter))
            : 'ללא אפיון – הסרת כל המאפיינים מהשדה',
          disabled: unsupported,
          'aria-pressed': def ? 'false' : null,
          onclick: function () { app.toggleFlag(letter); },
        },
        h('span', { class: 'flag-key' }, letter),
        h('span', { class: 'flag-name' }, def ? def.name : 'ללא אפיון'),
        def && def.status === 'approx' ? h('span', { class: 'approx-mark', 'aria-hidden': 'true' }, '≈') : null);
        if (letter) flagButtons[letter] = button;
        grid.appendChild(button);
      });
    });

    const extras = h('div', { class: 'extras' });
    M.EXTRA_OPTIONS.forEach(function (name) {
      const button = h('button', {
        type: 'button',
        class: 'chip',
        'aria-pressed': 'false',
        title: name + ' (אפשרות של אוצריא שאין לה מקבילה בבר-אילן)',
        onclick: function () { app.toggleFlag(name); },
      }, h('span', { class: 'flag-key small' }, root.BITableView.badgeText(name)), name);
      extraButtons[name] = button;
      extras.appendChild(button);
    });
    const more = h('details', { class: 'more' },
      h('summary', null, 'עוד באוצריא'),
      extras);

    const flagsCard = h('section', { class: 'card props-card', 'aria-label': 'מאפייני המרכיב לחיפוש' },
      h('div', { class: 'card-title-row' },
        h('h3', { class: 'card-title' }, 'מאפייני המרכיב לחיפוש'), target),
      grid,
      more);

    function refresh() {
      const focus = app.state.focus;
      const field = app.focusedField();
      target.textContent = app.state.markAll
        ? 'חל על: כל השדות המלאים'
        : 'חל על: מרכיב ' + (focus.col + 1) + (focus.row ? ', חלופה ' + focus.row : '');
      Object.keys(flagButtons).forEach(function (letter) {
        flagButtons[letter].setAttribute('aria-pressed', String(!!field && field.flags.indexOf(letter) !== -1));
      });
      Object.keys(extraButtons).forEach(function (name) {
        extraButtons[name].setAttribute('aria-pressed', String(!!field && field.flags.indexOf(name) !== -1));
      });
      markAll.checked = !!app.state.markAll;
    }

    return { el: flagsCard, refresh };
  }

  /** A checkbox bound to app.state.options[key]. */
  function optionCheck(app, key, label, opts) {
    const o = opts || {};
    const input = h('input', {
      type: 'checkbox',
      disabled: o.disabled,
      onchange: function () {
        app.state.options[key] = input.checked;
        app.changed('options');
      },
    });
    const el = h('label', { class: 'checkbox' + (o.disabled ? ' disabled' : ''), title: o.title },
      input, h('span', null, label));
    return {
      el,
      refresh: function () { input.checked = !o.disabled && !!app.state.options[key]; },
    };
  }

  function searchAllCheck(app) {
    return optionCheck(app, 'searchAll', 'חיפוש בכל המאגרים', {
      title: 'מתעלם מבחירת "המאגרים המשתתפים" ומחפש בכל הספרייה',
    });
  }

  /** "מאפייני החיפוש" – one instance per form view (טבלאי, מתקדם). */
  function createSearchPropsCard(app) {
    const checks = [
      searchAllCheck(app),
      optionCheck(app, 'showForms', 'הצג חלון ניהול הצורות', {
        disabled: true,
        title: 'לא נתמך: אוצריא אינה מחזירה את רשימת הצורות שנמצאו לפני הצגת התוצאות.',
      }),
      optionCheck(app, 'includeAcronyms', 'כולל ראשי תיבות ≈', {
        title: '≈ אוצריא מרחיבה כשהמילה היא ראשי תיבות או הצירוף המלא שלהם (אפשרות "ראשי תיבות").',
      }),
    ];
    const el = h('section', { class: 'card search-props-card', 'aria-label': 'מאפייני החיפוש' },
      h('h3', { class: 'card-title' }, 'מאפייני החיפוש'),
      h('div', { class: 'check-col' }, checks.map(function (c) { return c.el; })));
    return {
      el,
      refresh: function () { checks.forEach(function (c) { c.refresh(); }); },
    };
  }

  root.BIPropsView = { createPropsView, createSearchPropsCard, searchAllCheck };
})(window);
