'use strict';
const M = require('../plugin/js/core/model.js');

/**
 * Builds a 4×4 TableQuery from a compact description:
 *   table([[['משה', 'ק'], ['אהרון', 'קח']], [['ויאמר'], ['אמר']]], { gaps: [{ max: 3 }] })
 * Each field is [text, flagLetters]; flag letters are split per character.
 */
function table(columns, extra) {
  const query = M.createEmptyQuery();
  columns.forEach(function (fields, c) {
    fields.forEach(function (field, r) {
      if (!field) return;
      const flags = Array.isArray(field[1]) ? field[1] : (field[1] || '').split('');
      query.columns[c].fields[r] = M.createField(field[0], flags);
    });
  });
  const options = extra || {};
  (options.gaps || []).forEach(function (gap, i) {
    if (!gap) return;
    query.gaps[i] = M.createGap(gap.max, gap.dir || 'both');
  });
  if (options.proximity) query.proximity = options.proximity;
  if (options.searchAll === false) query.searchAll = false;
  if (options.includeAcronyms) query.includeAcronyms = true;
  return query;
}

module.exports = { table };
