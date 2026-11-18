/*
 * TableQuery – the one internal model behind the three Bar-Ilan input forms
 * (טבלאי, קל, מתקדם). Pure functions only: no DOM, no Otzaria calls, so the
 * same file runs in the plugin WebView and under `node --test`.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BIModel = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const TABLE_COLUMNS = 4;
  const TABLE_ROWS = 4; // main word + 3 alternatives ("או")

  /** Words between components that Otzaria uses to approximate "בתוך משפט". */
  const SENTENCE_WINDOW = 12;

  /**
   * Bar-Ilan property letters. `status`:
   *  exact  – maps 1:1 to an Otzaria word option
   *  approx – runs, but with a documented approximation (UI shows "≈")
   *  special – handled by the compiler itself (negation, family)
   *  unsupported – visible but disabled in the UI
   */
  const FLAGS = {
    'ק': { name: 'קידומות דקדוקיות', options: ['קידומות דקדוקיות'], status: 'exact' },
    'ס': { name: 'סיומות דקדוקיות', options: ['סיומות דקדוקיות'], status: 'exact' },
    'ח': { name: 'כתיב מלא/חסר', options: ['כתיב מלא/חסר'], status: 'exact' },
    'ג': { name: 'עם/בלי גרשיים', options: ['התעלם מגרשיים'], status: 'exact' },
    'ד': {
      name: 'קידומות',
      options: ['קידומות'],
      status: 'approx',
      note: 'באוצריא: עד 3 אותיות לפני המילה (במילה קצרה עד 5). ללא הגבלה – בתו * (חיפוש באוצריא).',
    },
    'מ': {
      name: 'סיומות',
      options: ['סיומות'],
      status: 'approx',
      note: 'באוצריא: עד 5 אותיות אחרי המילה (במילה קצרה עד 7). ללא הגבלה – בתו * (חיפוש באוצריא).',
    },
    'ע': {
      name: 'ערך',
      options: ['קידומות דקדוקיות', 'סיומות דקדוקיות', 'כתיב מלא/חסר'],
      status: 'approx',
      note: 'לאוצריא אין מילון ערכים. במקומו: קידומות וסיומות דקדוקיות וכתיב מלא/חסר.',
    },
    'ש': {
      name: 'שורש',
      options: ['קידומות דקדוקיות', 'סיומות דקדוקיות', 'כתיב מלא/חסר'],
      status: 'approx',
      note: 'לאוצריא אין ניתוח שורשים. במקומו: קידומות וסיומות דקדוקיות וכתיב מלא/חסר. לנטיות רחוקות – משפחת מילים.',
    },
    'ה': {
      name: 'משפחה',
      options: [],
      status: 'special',
      note: 'השדה מכיל שם משפחה; מילות המשפחה נכנסות כחלופות של המרכיב.',
    },
    'ל': {
      name: 'שלילת המרכיב',
      options: [],
      status: 'special',
      note: 'אוצריא מסננת תוצאות שבהן מופיע המרכיב השלול צמוד לשכניו (למשל "בני ישראל").',
    },
    'פ': {
      name: 'חיפוש שנשמר',
      options: [],
      status: 'unsupported',
      note: 'אוצריא אינה יכולה להשתמש בתוצאות של חיפוש קודם כמרכיב.',
    },
    'א': { name: 'תרגום לארמית', options: ['תרגום ארמי'], status: 'exact' },
  };

  /** Bar-Ilan layout of "מאפייני המרכיב לחיפוש", rows read right-to-left. */
  const FLAG_GRID = [
    ['ק', 'ד', 'ע', 'פ'],
    ['ס', 'מ', 'ש', 'א'],
    ['ח', 'ג', 'ה', null],
    ['', 'ל', null, null], // '' = ללא אפיון
  ];

  /** Otzaria options without a Bar-Ilan letter ("עוד באוצריא"). */
  const EXTRA_OPTIONS = [
    'חלק ממילה',
    'שגיאות כתיב',
    'קידומות ארמיות',
    'סיומות ארמיות',
    'ניקוד',
    'טעמים',
  ];

  const ACRONYM_OPTION = 'ראשי תיבות';

  const PROXIMITY_KINDS = ['pairs', 'range', 'sentence', 'paragraph', 'document'];

  function createField(text, flags) {
    return { text: text || '', flags: flags ? flags.slice() : [] };
  }

  function createColumn(rows) {
    const fields = [];
    for (let r = 0; r < (rows || TABLE_ROWS); r++) fields.push(createField());
    return { fields };
  }

  function createGap(max, dir) {
    return { max: max == null ? null : max, min: null, dir: dir || 'both' };
  }

  /** An empty query shaped like the Bar-Ilan table (4 columns × 4 rows). */
  function createEmptyQuery(columns, rows) {
    const count = columns || TABLE_COLUMNS;
    const cols = [];
    for (let c = 0; c < count; c++) cols.push(createColumn(rows));
    const gaps = [];
    for (let g = 0; g < count - 1; g++) gaps.push(createGap());
    return {
      schema: SCHEMA_VERSION,
      columns: cols,
      gaps,
      proximity: { kind: 'pairs' },
      searchAll: true,
      includeAcronyms: false,
      showForms: false,
    };
  }

  function cloneQuery(query) {
    return JSON.parse(JSON.stringify(query));
  }

  /** Same Hebrew normalisation the engine applies before splitting words. */
  function normalizeWord(text) {
    let word = String(text == null ? '' : text).trim();
    word = word.replace(/״/g, '"').replace(/׳/g, "'");
    word = word.replace(/''/g, '"');
    word = word.replace(/^"+|"+$/g, '');
    return word;
  }

  const PATTERN_CHARS = /[?*~@()/]/;
  // Hebrew letters and nikud/te'amim, Latin letters, digits; quotes only inside.
  const WORD_RE = /^[֑-ׇא-תa-zA-Z0-9]+(?:["'][֑-ׇא-תa-zA-Z0-9]+)*'?$/;

  /**
   * 'empty' | 'word' | 'pattern' (Bar-Ilan wildcards, needs the regex route)
   * | 'invalid' (more than one engine word, e.g. a space or a hyphen).
   */
  function classifyText(text) {
    const word = normalizeWord(text);
    if (!word) return 'empty';
    if (/[\s־-]/.test(word)) return 'invalid';
    if (PATTERN_CHARS.test(word)) return 'pattern';
    return WORD_RE.test(word) ? 'word' : 'invalid';
  }

  function isFieldFilled(field) {
    return !!field && normalizeWord(field.text) !== '';
  }

  /** Columns that contain at least one filled field, in table order. */
  function filledColumnIndexes(query) {
    const result = [];
    query.columns.forEach(function (column, index) {
      if (column.fields.some(isFieldFilled)) result.push(index);
    });
    return result;
  }

  function isEmptyQuery(query) {
    return filledColumnIndexes(query).length === 0;
  }

  /**
   * Gap between two filled columns after empty columns in between are dropped
   * (Bar-Ilan ignores empty columns): the first gap with a number wins.
   */
  function gapBetween(query, fromIndex, toIndex) {
    for (let g = fromIndex; g < toIndex; g++) {
      const gap = query.gaps[g];
      if (gap && gap.max != null) return gap;
    }
    return query.gaps[fromIndex] || createGap();
  }

  /** Union of the flags of every filled field in a column. */
  function columnFlags(column) {
    const set = [];
    column.fields.forEach(function (field) {
      if (!isFieldFilled(field)) return;
      field.flags.forEach(function (flag) {
        if (set.indexOf(flag) === -1) set.push(flag);
      });
    });
    return set;
  }

  function toggleFlag(field, flag) {
    if (flag === '') {
      field.flags = [];
      return field;
    }
    const at = field.flags.indexOf(flag);
    if (at === -1) field.flags.push(flag);
    else field.flags.splice(at, 1);
    return field;
  }

  function flagLabel(flag) {
    if (FLAGS[flag]) return FLAGS[flag].name;
    return flag;
  }

  /** Accepts a stored query of any older shape and returns a valid one. */
  function upgradeQuery(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns)) {
      return createEmptyQuery();
    }
    const query = createEmptyQuery(Math.max(raw.columns.length, 1));
    raw.columns.forEach(function (column, c) {
      const fields = Array.isArray(column && column.fields) ? column.fields : [];
      const target = query.columns[c];
      while (target.fields.length < fields.length) target.fields.push(createField());
      fields.forEach(function (field, r) {
        target.fields[r] = createField(
          field && typeof field.text === 'string' ? field.text : '',
          Array.isArray(field && field.flags) ? field.flags.filter(isKnownFlag) : []
        );
      });
    });
    (Array.isArray(raw.gaps) ? raw.gaps : []).forEach(function (gap, g) {
      if (g >= query.gaps.length || !gap) return;
      const max = Number.isInteger(gap.max) && gap.max > 0 ? gap.max : null;
      query.gaps[g] = createGap(max, gap.dir === 'forward' ? 'forward' : 'both');
      if (Number.isInteger(gap.min) && gap.min > 1) query.gaps[g].min = gap.min;
    });
    const kind = raw.proximity && raw.proximity.kind;
    if (PROXIMITY_KINDS.indexOf(kind) !== -1) {
      query.proximity = { kind };
      if (kind === 'range') {
        const n = Number(raw.proximity.n);
        query.proximity.n = Number.isInteger(n) && n > 0 ? n : 5;
      }
    }
    query.searchAll = raw.searchAll !== false;
    query.includeAcronyms = raw.includeAcronyms === true;
    query.showForms = raw.showForms === true;
    return query;
  }

  function isKnownFlag(flag) {
    return Object.prototype.hasOwnProperty.call(FLAGS, flag) || EXTRA_OPTIONS.indexOf(flag) !== -1;
  }

  /** Pads a parsed query to the 4 × 4 table so the tabular view can show it. */
  function fitToTable(query) {
    const fitted = upgradeQuery(query);
    while (fitted.columns.length < TABLE_COLUMNS) {
      fitted.columns.push(createColumn());
      fitted.gaps.push(createGap());
    }
    fitted.columns.forEach(function (column) {
      while (column.fields.length < TABLE_ROWS) column.fields.push(createField());
    });
    return fitted;
  }

  /** True when the query can be shown in the 4 × 4 table without losing words. */
  function fitsTable(query) {
    if (query.columns.length > TABLE_COLUMNS) return false;
    return query.columns.every(function (column) {
      return column.fields.filter(isFieldFilled).length <= TABLE_ROWS;
    });
  }

  return {
    SCHEMA_VERSION,
    TABLE_COLUMNS,
    TABLE_ROWS,
    SENTENCE_WINDOW,
    FLAGS,
    FLAG_GRID,
    EXTRA_OPTIONS,
    ACRONYM_OPTION,
    PROXIMITY_KINDS,
    createField,
    createColumn,
    createGap,
    createEmptyQuery,
    cloneQuery,
    normalizeWord,
    classifyText,
    isFieldFilled,
    filledColumnIndexes,
    isEmptyQuery,
    gapBetween,
    columnFlags,
    toggleFlag,
    flagLabel,
    upgradeQuery,
    fitToTable,
    fitsTable,
    isKnownFlag,
  };
});
