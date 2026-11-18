/*
 * Bar-Ilan helper dialogs: שאילתות קודמות, חיפושים שמורים, משפחות,
 * דוגמאות להרחבת מרכיב החיפוש, עזרה, ניקוד, and the Hebrew keyboard.
 */
(function (root) {
  'use strict';

  const M = root.BIModel;
  const D = root.BIDom;
  const Dlg = root.BIDialog;
  const Store = root.BIStore;
  const h = D.h;

  const VIEW_NAMES = { table: 'טבלאי', easy: 'קל', advanced: 'מתקדם', free: 'ניסוח חופשי' };

  function formatDate(at) {
    try {
      return new Date(at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });
    } catch (e) {
      return '';
    }
  }

  /**
   * Keyboard-navigable single-selection list.
   * render(item) -> Node; onActivate(index) on Enter / double-click.
   */
  function createListbox(label, render, onActivate, onSelect) {
    const el = h('div', { class: 'list', role: 'listbox', 'aria-label': label, tabindex: '0' });
    let items = [];
    let indexes = [];
    let selected = -1;

    function set(newItems, newIndexes) {
      items = newItems;
      indexes = newIndexes || newItems.map(function (_, i) { return i; });
      D.clear(el);
      items.forEach(function (item, i) {
        el.appendChild(h('div', {
          class: 'list-row',
          role: 'option',
          'aria-selected': 'false',
          onclick: function () { select(i); },
          ondblclick: function () { select(i); onActivate(indexes[i]); },
        }, render(item)));
      });
      select(items.length ? 0 : -1);
    }

    function select(i) {
      selected = i;
      Array.prototype.forEach.call(el.children, function (row, j) {
        row.setAttribute('aria-selected', String(j === i));
        if (j === i) row.scrollIntoView({ block: 'nearest' });
      });
      if (onSelect) onSelect(selectedIndex());
    }

    function selectedIndex() {
      return selected >= 0 ? indexes[selected] : -1;
    }

    el.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' && selected < items.length - 1) { event.preventDefault(); select(selected + 1); }
      else if (event.key === 'ArrowUp' && selected > 0) { event.preventDefault(); select(selected - 1); }
      else if (event.key === 'Enter' && selected >= 0) { event.preventDefault(); onActivate(selectedIndex()); }
    });

    return { el, set, selectedIndex };
  }

  // ── שאילתות קודמות ───────────────────────────────────────────────────────

  function openHistory(app) {
    const filter = h('input', { class: 'input', type: 'text', 'aria-label': 'אתר', placeholder: 'סינון' });
    const count = h('span', { class: 'muted' });
    let dlg;
    const list = createListbox('שאילתות קודמות', function (entry) {
      return h('div', { class: 'list-entry' },
        D.syntaxNode(entry.text || entry.syntax),
        h('span', { class: 'muted small' }, (VIEW_NAMES[entry.view] || '') + ' · ' + formatDate(entry.at)));
    }, function (index) { choose(index); });

    function fill() {
      const needle = filter.value.trim();
      const all = Store.data.history;
      const indexes = [];
      const items = all.filter(function (entry, i) {
        const ok = !needle || (entry.text || entry.syntax || '').indexOf(needle) !== -1;
        if (ok) indexes.push(i);
        return ok;
      });
      list.set(items, indexes);
      count.textContent = all.length + ' שאילתות ברשימה';
      if (!all.length) list.el.appendChild(h('p', { class: 'muted empty' }, 'אין עדיין שאילתות קודמות.'));
    }

    function choose(index) {
      if (index < 0) return;
      app.loadEntry(Store.data.history[index]);
      dlg.close();
    }

    filter.addEventListener('input', fill);
    filter.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') { event.preventDefault(); list.el.focus(); }
      if (event.key === 'Enter') { event.preventDefault(); choose(list.selectedIndex()); }
    });

    dlg = Dlg.openDialog({
      title: 'בחירת שאילתה קודמת',
      size: 'md',
      initialFocus: filter,
      body: h('div', { class: 'dialog-stack' },
        h('label', { class: 'field-label inline' }, h('span', null, 'אתר:'), filter),
        list.el,
        count),
      actions: [
        { label: 'מחק', icon: 'trash', onclick: function () {
          const i = list.selectedIndex();
          if (i >= 0) { Store.removeHistory(i); fill(); }
        } },
        { label: 'מחק הכל', onclick: function () {
          confirmAction('למחוק את כל השאילתות הקודמות?').then(function (ok) { if (ok) { Store.clearHistory(); fill(); } });
        } },
        'spacer',
        { label: 'ביטול' },
        { label: 'אישור', variant: 'filled', onclick: function () { choose(list.selectedIndex()); } },
      ],
    });
    fill();
  }

  function confirmAction(text) {
    return root.BIHost.call('ui.showConfirm', { title: 'אישור', content: text })
      .then(function (data) { return !!(data && data.confirmed); })
      .catch(function () { return window.confirm(text); });
  }

  // ── חיפושים שמורים ───────────────────────────────────────────────────────

  function openSaved(app) {
    let dlg;
    const list = createListbox('חיפושים שמורים', function (entry) {
      return h('div', { class: 'list-entry grid' },
        h('strong', null, entry.name),
        D.syntaxNode(entry.text || entry.syntax),
        h('span', { class: 'muted small' },
          (entry.total != null ? entry.total.toLocaleString('he-IL') + ' תוצאות · ' : '') + formatDate(entry.at)));
    }, function (index) { load(index); });

    function fill() {
      list.set(Store.data.saved.slice());
      if (!Store.data.saved.length) {
        list.el.appendChild(h('p', { class: 'muted empty' }, 'לא קיימים חיפושים שמורים.'));
      }
    }
    function load(index) {
      if (index < 0) return;
      app.loadEntry(Store.data.saved[index]);
      dlg.close();
    }
    function run(index) {
      if (index < 0) return;
      app.loadEntry(Store.data.saved[index], { run: true });
      dlg.close();
    }

    dlg = Dlg.openDialog({
      title: 'חיפושים שמורים',
      size: 'md',
      body: h('div', { class: 'dialog-stack' },
        list.el,
        h('p', { class: 'muted small' },
          'נשמרות הגדרות החיפוש (המילים, המאפיינים, המרחקים והמאגרים) – לא רשימת התוצאות עצמה. ' +
          '"הצג תוצאות" מריץ את החיפוש מחדש.')),
      actions: [
        { label: 'שמור חיפוש נוכחי', icon: 'save', onclick: function () {
          app.saveCurrentSearch().then(fill);
        } },
        { label: 'מחק', icon: 'trash', onclick: function () {
          const i = list.selectedIndex();
          if (i >= 0) { Store.removeSaved(i); fill(); }
        } },
        { label: 'מחק הכל', onclick: function () {
          confirmAction('למחוק את כל החיפושים השמורים?').then(function (ok) { if (ok) { Store.clearSaved(); fill(); } });
        } },
        'spacer',
        { label: 'ביטול' },
        { label: 'הצג תוצאות', onclick: function () { run(list.selectedIndex()); } },
        { label: 'אישור', variant: 'filled', onclick: function () { load(list.selectedIndex()); } },
      ],
    });
    fill();
  }

  // ── משפחות ──────────────────────────────────────────────────────────────

  function openFamilies(app) {
    const families = JSON.parse(JSON.stringify(Store.data.families || {}));
    let current = Object.keys(families)[0] || null;
    const select = h('select', { class: 'input select', 'aria-label': 'רשימת המשפחות' });
    const wordInput = h('input', { class: 'input', type: 'text', dir: 'rtl', 'aria-label': 'מילה חדשה', placeholder: 'מילה חדשה' });
    const words = createListbox('רשימת המילים במשפחה', function (word) { return h('span', null, word); }, function () {});

    function fill() {
      D.clear(select);
      const names = Object.keys(families).sort();
      names.forEach(function (name) { select.appendChild(h('option', { value: name }, name)); });
      if (current && names.indexOf(current) === -1) current = names[0] || null;
      select.value = current || '';
      select.disabled = !names.length;
      words.set(current ? families[current] : []);
      if (!current) words.el.appendChild(h('p', { class: 'muted empty' }, 'אין משפחות. לחצו "משפחה חדשה".'));
    }

    function addWord() {
      const word = M.normalizeWord(wordInput.value);
      if (!current || !word) return;
      if (M.classifyText(word) !== 'word') {
        root.BIHost.notifyError('מילה אחת בלבד, בלי רווח, מקף או תווים כלליים.');
        return;
      }
      if (families[current].indexOf(word) === -1) families[current].push(word);
      wordInput.value = '';
      fill();
      wordInput.focus();
    }

    select.addEventListener('change', function () { current = select.value; fill(); });
    wordInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); addWord(); }
    });

    function save() {
      Store.setFamilies(families);
      app.changed('families');
    }

    const dlg = Dlg.openDialog({
      title: 'ניהול משפחות מלים',
      size: 'md',
      body: h('div', { class: 'dialog-stack' },
        h('label', { class: 'field-label' }, h('span', null, 'רשימת המשפחות'), select),
        h('div', { class: 'row-tools' },
          D.button('משפחה חדשה', { icon: 'add', onclick: function () {
            Dlg.prompt('משפחה חדשה', 'שם המשפחה', '').then(function (name) {
              const key = name && M.normalizeWord(name);
              if (!key) return;
              if (!families[key]) families[key] = [];
              current = key;
              fill();
              wordInput.focus();
            });
          } }),
          D.button('מחק משפחה', { icon: 'trash', onclick: function () {
            if (current) { delete families[current]; current = null; fill(); }
          } }),
          D.button('מחק הכל', { onclick: function () {
            confirmAction('למחוק את כל המשפחות?').then(function (ok) {
              if (ok) { Object.keys(families).forEach(function (k) { delete families[k]; }); current = null; fill(); }
            });
          } })),
        h('span', { class: 'field-caption' }, 'רשימת המילים במשפחה'),
        words.el,
        h('div', { class: 'row-tools' },
          wordInput,
          D.button('הוסף מילה', { icon: 'add', onclick: addWord }),
          D.button('מחק מילה', { icon: 'trash', onclick: function () {
            const i = words.selectedIndex();
            if (current && i >= 0) { families[current].splice(i, 1); fill(); }
          } })),
        h('p', { class: 'muted small' },
          'בטבלה: הקלידו את שם המשפחה בשדה וסמנו "ה" (משפחה). בתחביר המתקדם: <שם>. ' +
          'המילים נכנסות כחלופות של המרכיב.')),
      actions: [
        { label: 'שבץ במרכיב', title: 'שומר, וכותב את שם המשפחה בשדה שנבחר בטבלה עם המאפיין ה', onclick: function (close) {
          if (!current) return;
          save();
          close();
          app.insertFamily(current);
        } },
        'spacer',
        { label: 'ביטול' },
        { label: 'אישור', variant: 'filled', onclick: function (close) { save(); close(); } },
      ],
    });
    fill();
    return dlg;
  }

  // ── דוגמאות להרחבת מרכיב החיפוש ──────────────────────────────────────────

  const WILDCARD_EXAMPLES = [
    ['?', 'אות אחת בדיוק', 'מ?ה', 'משה, מטה, מקה…'],
    ['~', 'אות אחת לכל היותר', 'שמ~ר', 'שמר, שמור, שמיר'],
    ['*', 'מספר כלשהו של אותיות', 'תפל*', 'תפלה, תפלין, תפלות…'],
    ['@', 'בתוך (…) – בלי אות', 'אהר(ו/@)ן', 'אהרן, אהרון'],
    ['(א/ב)', 'אחת מהאותיות במקום זה', '(ס/ש)כר', 'סכר, שכר'],
  ];

  function openExamples(app) {
    const rows = WILDCARD_EXAMPLES.map(function (ex) {
      return h('tr', null,
        h('td', null, h('code', null, ex[0])),
        h('td', null, ex[1]),
        h('td', null, h('button', {
          type: 'button',
          class: 'link-btn',
          title: 'הכנסה לשדה שנבחר',
          onclick: function () { app.insertExample(ex[2]); dlg.close(); },
        }, h('code', { dir: 'rtl' }, ex[2]))),
        h('td', { class: 'muted' }, ex[3]));
    });
    const dlg = Dlg.openDialog({
      title: 'דוגמאות להרחבת מרכיב החיפוש',
      size: 'md',
      body: h('div', { class: 'dialog-stack prose' },
        h('table', { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, 'תו'), h('th', null, 'משמעות'), h('th', null, 'דוגמה'), h('th', null, 'מוצא'))),
          h('tbody', null, rows)),
        h('p', null, 'דוגמה מורכבת: ', h('code', { dir: 'rtl' }, '*(ט/ת)(א/ע/י/@)ל(ע/י/@)פ(א/ו)ן*'), ' – כל צורות הכתיב של "טלפון".'),
        h('p', { class: 'notice-text' },
          'שאילתה עם תווים כלליים רצה כביטוי רגולרי ומוצגת כאן, עד ' + root.BIRegexSearch.HIT_LIMIT +
          ' תוצאות, והמאגרים מסוננים בתוסף אחרי החיפוש. אם אוצריא אינה מאפשרת זאת, השאילתה נפתחת בחיפוש של אוצריא. ' +
          'מאפייני מילה פרט ל-ק, ס, ד, מ אינם חלים. אפשר גם להקליד ביטוי רגולרי ישיר /…/ ב"חיפוש מתקדם".')),
      actions: ['spacer', { label: 'סגירה', variant: 'filled' }],
    });
  }

  // ── עזרה ─────────────────────────────────────────────────────────────────

  function openHelp() {
    const flagRows = Object.keys(M.FLAGS).map(function (letter) {
      const def = M.FLAGS[letter];
      const status = { exact: '✓', approx: '≈', special: '✓', unsupported: '✗' }[def.status];
      return h('tr', null,
        h('td', null, h('span', { class: 'flag-key' }, letter)),
        h('td', null, def.name),
        h('td', { class: 'center' }, status),
        h('td', { class: 'muted' }, def.note || (def.options.length ? 'אפשרות אוצריא: ' + def.options.join(', ') : '')));
    });
    Dlg.openDialog({
      title: 'עזרה – חיפוש טבלאי בסגנון בר-אילן',
      size: 'lg',
      body: h('div', { class: 'dialog-stack prose' },
        h('h4', null, 'מרכיבי החיפוש'),
        h('p', null, 'כל טור הוא מרכיב. השדה העליון הוא המילה, ושלושת השדות שמתחתיה ("או") חלופות. ' +
          'כל המרכיבים חייבים להופיע ("וגם"). טור ריק מדולג. Tab עובר שורה אחר שורה כמו בבר-אילן, חצים למעלה/למטה בתוך הטור, Enter מחפש.'),
        h('h4', null, 'מרחקים'),
        h('p', null, 'כמו בבר-אילן: שדה ריק = צמוד; המספר N = המרכיב הבא עד N מקומות אחרי הקודם (עד N−1 מילים ביניהם). ' +
          'כפתור החץ קובע אם בכל סדר (↔, ברירת המחדל) או לפי הסדר בלבד.'),
        h('p', null, '≈ באוצריא "בכל סדר" חל על כל הזוגות יחד: כשמוזנים מרחקים שונים, יחול המרחק הגדול. ' +
          '"טווח מילים" נבדק בין זוגות סמוכים. "בתוך פסקה" = אותה שורה באוצריא; "בתוך מסמך" ≈ תחת אותה כותרת; ' +
          '"בתוך משפט" ≈ עד ' + (M.SENTENCE_WINDOW - 1) + ' מילים ביניהם.'),
        h('h4', null, 'מאפייני המרכיב'),
        h('p', null, 'בחרו שדה ולחצו על מאפיין (או Alt+האות). האות מופיעה ליד השדה; לחיצה עליה מסירה אותה. ' +
          '≈ באוצריא המאפיינים חלים על כל הטור (המילה וחלופותיה).'),
        h('table', { class: 'table' },
          h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'מאפיין'), h('th', null, 'מצב'), h('th', null, 'הערה'))),
          h('tbody', null, flagRows)),
        h('p', null, '"עוד באוצריא": אפשרויות של אוצריא שאין להן מקבילה בבר-אילן (חלק ממילה, שגיאות כתיב, ניקוד ועוד).'),
        h('h4', null, 'המאגרים המשתתפים'),
        h('p', null, 'בחירת קטגוריות וספרים (עד רמת ספר; פרק ופסקה אינם נתמכים), קבוצות מאגרים שמורות ותקופות. ' +
          '"חיפוש בכל המאגרים" מתעלם מהבחירה.'),
        h('h4', null, 'לא נתמך באוצריא'),
        h('ul', null,
          h('li', null, 'ניסוח חופשי – נפתח בחיפוש של אוצריא בלי להריץ.'),
          h('li', null, '{{ביטוי}} של כמה מילים כחלופה אחת.'),
          h('li', null, 'חיפוש שנשמר (פ) כמרכיב; חלון ניהול הצורות; קבוצות ניקוד ודגש.'),
          h('li', null, 'מרחק מינימלי ([4:2]) – החיפוש מתחיל ממילה צמודה.'))),
      actions: ['spacer', { label: 'סגירה', variant: 'filled' }],
    });
  }

  // ── ניקוד ────────────────────────────────────────────────────────────────

  const NIQQUD = [
    ['ָ', 'קמץ'], ['ַ', 'פתח'], ['ֵ', 'צירה'], ['ֶ', 'סגול'], ['ִ', 'חיריק'],
    ['ֹ', 'חולם'], ['ֻ', 'קובוץ'], ['ְ', 'שווא'], ['ֲ', 'חטף פתח'], ['ֱ', 'חטף סגול'],
    ['ֳ', 'חטף קמץ'], ['ּ', 'דגש / שורוק'], ['ׁ', 'שין ימנית'], ['ׂ', 'שין שמאלית'],
  ];

  function openNiqqud(app) {
    const field = app.focusedField();
    const input = h('input', {
      class: 'input niqqud-input',
      type: 'text',
      dir: 'rtl',
      'aria-label': 'המילה המנוקדת',
      value: field ? field.text : '',
    });
    const optNiqqud = h('input', { type: 'checkbox', checked: !!field && field.flags.indexOf('ניקוד') !== -1 });
    const optTaamim = h('input', { type: 'checkbox', checked: !!field && field.flags.indexOf('טעמים') !== -1 });
    const keys = h('div', { class: 'key-grid' }, NIQQUD.map(function (n) {
      return h('button', {
        type: 'button',
        class: 'key',
        title: n[1],
        'aria-label': n[1],
        onmousedown: function (event) { event.preventDefault(); },
        onclick: function () { D.insertAtCaret(input, n[0]); input.focus(); },
      }, h('span', { class: 'key-glyph' }, '◌' + n[0]), h('span', { class: 'key-name' }, n[1]));
    }));
    const groups = h('div', { class: 'row-tools' }, ['A', 'E', 'I', 'O', 'U', 'X'].map(function (g) {
      return D.button(g, { disabled: true, title: 'קבוצות ניקוד (כל תנועה מסוג ' + g + ') אינן נתמכות באוצריא.' });
    }), D.button('דגש ✓/✗', { disabled: true, title: 'תנאי דגש/מפיק אינם נתמכים באוצריא.' }));

    Dlg.openDialog({
      title: 'ניקוד',
      size: 'md',
      initialFocus: input,
      body: h('div', { class: 'dialog-stack' },
        h('p', null, 'הקלידו את המילה עם הניקוד הרצוי. אוצריא תחפש את הניקוד כפי שהוקלד (במקומות שבהם הספר מנוקד).'),
        h('label', { class: 'field-label' }, h('span', null, 'המלה'), input),
        keys,
        h('div', { class: 'check-col' },
          h('label', { class: 'checkbox' }, optNiqqud, h('span', null, 'התאמת ניקוד')),
          h('label', { class: 'checkbox' }, optTaamim, h('span', null, 'התאמת טעמים'))),
        h('span', { class: 'field-caption' }, 'לא נתמך באוצריא ≈'),
        groups),
      actions: ['spacer', { label: 'ביטול' }, { label: 'אישור', variant: 'filled', onclick: function (close) {
        app.applyNiqqud(input.value, optNiqqud.checked, optTaamim.checked);
        close();
      } }],
    });
  }

  // ── מקלדת ────────────────────────────────────────────────────────────────

  const KEY_ROWS = ['קראטוןםפ', 'שדגכעיחלךף', 'זסבהנמצתץ'];

  function openKeyboard(anchor, getTarget) {
    const pad = h('div', { class: 'keyboard', role: 'group', 'aria-label': 'מקלדת עברית' });
    function press(text) {
      const input = getTarget();
      if (!input) return;
      if (text === '\b') {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        if (start === end && start > 0) input.setSelectionRange(start - 1, end);
        D.insertAtCaret(input, '');
      } else D.insertAtCaret(input, text);
    }
    KEY_ROWS.forEach(function (row) {
      pad.appendChild(h('div', { class: 'key-row' }, row.split('').map(function (ch) {
        return h('button', {
          type: 'button',
          class: 'key',
          onmousedown: function (event) { event.preventDefault(); },
          onclick: function () { press(ch); },
        }, ch);
      })));
    });
    pad.appendChild(h('div', { class: 'key-row' },
      ['"', "'", '?', '*'].map(function (ch) {
        return h('button', { type: 'button', class: 'key', onmousedown: function (e) { e.preventDefault(); }, onclick: function () { press(ch); } }, ch);
      }),
      h('button', { type: 'button', class: 'key wide', onmousedown: function (e) { e.preventDefault(); }, onclick: function () { press(' '); } }, 'רווח'),
      h('button', { type: 'button', class: 'key', title: 'מחיקה', 'aria-label': 'מחיקה', onmousedown: function (e) { e.preventDefault(); }, onclick: function () { press('\b'); } }, '⌫')));
    Dlg.openPopover(anchor, pad);
  }

  root.BIDialogs = { openHistory, openSaved, openFamilies, openExamples, openHelp, openNiqqud, openKeyboard, createListbox, confirmAction, VIEW_NAMES };
})(window);
