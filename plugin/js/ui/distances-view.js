/*
 * "מרחקים": per-pair distances with a direction toggle (Bar-Ilan counting:
 * empty = adjacent, N = the next word at most N positions later), or one of
 * the scopes טווח מילים / בתוך משפט / בתוך פסקה / בתוך מסמך.
 */
(function (root) {
  'use strict';

  const M = root.BIModel;
  const D = root.BIDom;
  const h = D.h;

  const NUMBER_TITLE = 'מיקום המרכיב הבא: ריק = צמוד, 5 = עד 4 מילים ביניהם';

  function createDistancesView(app) {
    const radios = {};
    const pairInputs = [];
    const dirButtons = [];
    let rangeInput;

    function query() { return app.state.table; }

    function radio(kind, label, extraTitle) {
      const input = h('input', {
        type: 'radio',
        name: 'proximity',
        value: kind,
        onchange: function () {
          const q = query();
          q.proximity = kind === 'range' ? { kind, n: readRange() } : { kind };
          app.changed('distances');
          refresh();
        },
      });
      radios[kind] = input;
      return h('label', { class: 'radio', title: extraTitle }, input, h('span', null, label));
    }

    function readRange() {
      const n = parseInt(rangeInput.value, 10);
      return Number.isInteger(n) && n > 0 ? n : 5;
    }

    function numberInput(label, oninput) {
      return h('input', {
        class: 'input number',
        type: 'number',
        min: '1',
        max: '999',
        inputmode: 'numeric',
        placeholder: '–',
        title: NUMBER_TITLE,
        'aria-label': label,
        oninput,
      });
    }

    function pair(i) {
      const label = i === 0 ? 'בין טור 1 ל-2:' : 'בין ' + (i + 1) + ' ל-' + (i + 2) + ':';
      const input = numberInput('מרחק ' + label, function () {
        const n = parseInt(input.value, 10);
        const gap = query().gaps[i];
        gap.max = Number.isInteger(n) && n > 0 ? n : null;
        if (query().proximity.kind !== 'pairs') {
          query().proximity = { kind: 'pairs' };
        }
        app.changed('distances');
        refresh();
      });
      const dir = h('button', {
        type: 'button',
        class: 'icon-btn dir-btn',
        onclick: function () {
          const gap = query().gaps[i];
          gap.dir = gap.dir === 'both' ? 'forward' : 'both';
          app.changed('distances');
          refresh();
        },
      });
      pairInputs[i] = input;
      dirButtons[i] = dir;
      const head = i === 0
        ? radio('pairs', label)
        : h('span', { class: 'pair-label' }, label);
      return h('div', { class: 'pair' }, head, input, dir);
    }

    rangeInput = numberInput('טווח מילים', function () {
      if (query().proximity.kind !== 'range') radios.range.checked = true;
      query().proximity = { kind: 'range', n: readRange() };
      app.changed('distances');
      refresh();
    });

    const sentenceNote = '≈ לאוצריא אין גבולות משפט: נחפש עד ' + (M.SENTENCE_WINDOW - 1) +
      ' מילים בין המרכיבים, בכל סדר.';

    const el = h('section', { class: 'card dist-card', 'aria-label': 'מרחקים' },
      h('h3', { class: 'card-title' }, 'מרחקים'),
      h('div', { class: 'dist-row' }, pair(0), pair(1), pair(2)),
      h('div', { class: 'dist-row' },
        h('div', { class: 'pair' }, radio('range', 'טווח מילים',
          '≈ כל המרכיבים בטווח של N מילים, בכל סדר. אוצריא בודקת את המרחק בין כל זוג מרכיבים סמוכים.'),
        rangeInput),
        radio('sentence', 'בתוך משפט ≈', sentenceNote),
        radio('paragraph', 'בתוך פסקה', 'כל המרכיבים באותה פסקה (באוצריא: אותה שורה – הלכה, סעיף, דיבור המתחיל)'),
        radio('document', 'בתוך מסמך ≈', '≈ באוצריא: תחת אותה כותרת (פרק, סימן)')));

    function refresh() {
      const q = query();
      const kind = q.proximity.kind;
      Object.keys(radios).forEach(function (k) { radios[k].checked = k === kind; });
      if (kind === 'range' && document.activeElement !== rangeInput) rangeInput.value = q.proximity.n;
      q.gaps.forEach(function (gap, i) {
        const input = pairInputs[i];
        if (!input) return;
        if (document.activeElement !== input) input.value = gap.max == null ? '' : gap.max;
        input.classList.toggle('muted', kind !== 'pairs');
        const both = gap.dir !== 'forward';
        const button = dirButtons[i];
        D.clear(button).appendChild(D.icon(both ? 'both' : 'forward'));
        const label = both ? 'בכל סדר (↔) – לחיצה: לפי הסדר בלבד' : 'לפי הסדר בלבד – לחיצה: בכל סדר (↔)';
        button.title = gap.max == null ? 'הזינו מרחק כדי לבחור כיוון' : label;
        button.setAttribute('aria-label', 'כיוון: ' + (both ? 'בכל סדר' : 'לפי הסדר'));
        button.setAttribute('aria-pressed', both ? 'false' : 'true');
        button.disabled = gap.max == null || kind !== 'pairs';
      });
    }

    return { el, refresh };
  }

  root.BIDistancesView = { createDistancesView };
})(window);
