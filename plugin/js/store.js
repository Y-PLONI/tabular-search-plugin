/*
 * Persistent plugin data in Otzaria's private storage (storage.*):
 * previous queries, saved searches, word families, corpus groups and prefs.
 * Writes are debounced per key; reads happen once at boot.
 */
(function (root) {
  'use strict';

  const Host = root.BIHost;
  const KEYS = {
    history: 'bi.history.v1',
    saved: 'bi.saved.v1',
    families: 'bi.families.v1',
    scopeGroups: 'bi.scopeGroups.v1',
    prefs: 'bi.prefs.v1',
  };
  const LIMITS = { history: 200, saved: 100, families: 200, scopeGroups: 50 };

  const data = {
    history: [],      // [{ syntax, view, query, text, at }]
    saved: [],        // [{ name, syntax, view, query, text, scope, total, at }]
    families: {},     // { name: [words] }
    scopeGroups: [],  // [{ name, scope }]
    prefs: {},        // { scope, options, order, pageSize }
  };
  const timers = {};
  let available = true;

  async function load() {
    await Promise.all(Object.keys(KEYS).map(async function (name) {
      try {
        const value = await Host.call('storage.get', { key: KEYS[name] });
        if (value != null) data[name] = sanitize(name, value);
      } catch (error) {
        available = false;
      }
    }));
    return data;
  }

  function sanitize(name, value) {
    if (name === 'families' || name === 'prefs') {
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    }
    return Array.isArray(value) ? value.slice(0, LIMITS[name]) : [];
  }

  function persist(name) {
    clearTimeout(timers[name]);
    timers[name] = setTimeout(function () {
      Host.call('storage.set', { key: KEYS[name], value: data[name] }).catch(function () {
        available = false;
        Host.notifyError('שמירת הנתונים של התוסף נכשלה.');
      });
    }, 300);
  }

  function addHistory(entry) {
    data.history = data.history.filter(function (h) { return h.syntax !== entry.syntax || h.view !== entry.view; });
    data.history.unshift(Object.assign({ at: Date.now() }, entry));
    data.history.length = Math.min(data.history.length, LIMITS.history);
    persist('history');
  }

  function removeHistory(index) {
    data.history.splice(index, 1);
    persist('history');
  }

  function clearHistory() {
    data.history = [];
    persist('history');
  }

  function saveSearch(entry) {
    data.saved = data.saved.filter(function (s) { return s.name !== entry.name; });
    data.saved.unshift(Object.assign({ at: Date.now() }, entry));
    data.saved.length = Math.min(data.saved.length, LIMITS.saved);
    persist('saved');
  }

  function removeSaved(index) {
    data.saved.splice(index, 1);
    persist('saved');
  }

  function clearSaved() {
    data.saved = [];
    persist('saved');
  }

  function setFamilies(families) {
    data.families = families;
    persist('families');
  }

  function setScopeGroups(groups) {
    data.scopeGroups = groups.slice(0, LIMITS.scopeGroups);
    persist('scopeGroups');
  }

  function setPrefs(patch) {
    data.prefs = Object.assign({}, data.prefs, patch);
    persist('prefs');
  }

  root.BIStore = {
    data,
    load,
    isAvailable: function () { return available; },
    addHistory,
    removeHistory,
    clearHistory,
    saveSearch,
    removeSaved,
    clearSaved,
    setFamilies,
    setScopeGroups,
    setPrefs,
    LIMITS,
  };
})(window);
