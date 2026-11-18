/*
 * Otzaria theme payload -> CSS custom properties. The WebView inherits no
 * Otzaria CSS: every colour, surface, font and size arrives here as data.
 */
(function (root) {
  'use strict';

  function kebab(name) {
    return name.replace(/[A-Z]/g, function (c) { return '-' + c.toLowerCase(); });
  }

  function set(style, name, value) {
    if (value === undefined || value === null || value === '') return;
    style.setProperty(name, String(value));
  }

  function quoteFamily(family) {
    return /[,'"]/.test(family) ? family : "'" + family + "'";
  }

  function applyTheme(theme) {
    if (!theme || !theme.colorScheme) return;
    const style = document.documentElement.style;
    const cs = theme.colorScheme;
    Object.keys(cs).forEach(function (role) {
      set(style, '--color-' + kebab(role), cs[role]);
    });

    const surfaces = theme.surfaces || {};
    set(style, '--surface-panel', surfaces.panel || cs.surface);
    set(style, '--surface-card', surfaces.card || cs.surfaceContainerLow || cs.surface);
    set(style, '--surface-top-bar', surfaces.topBar || cs.surfaceContainerHigh);

    const t = theme.typography || {};
    if (t.uiFont) set(style, '--font-ui', t.uiFont);
    else if (t.uiFontFamily) set(style, '--font-ui', quoteFamily(t.uiFontFamily) + ', system-ui, sans-serif');
    if (t.fontFamily) set(style, '--font-main', quoteFamily(t.fontFamily) + ", 'David', serif");
    if (t.lineHeight) set(style, '--line-height-reading', t.lineHeight);

    if (theme.radius != null) set(style, '--radius', theme.radius + 'px');
    const spacing = theme.spacing || {};
    ['xs', 'sm', 'smd', 'md', 'lg', 'xl'].forEach(function (key) {
      if (spacing[key] != null) set(style, '--space-' + key, spacing[key] + 'px');
    });
    const density = theme.density || {};
    if (density.fieldHeight) set(style, '--field-height', density.fieldHeight + 'px');
    if (density.topBarHeight) set(style, '--top-bar-height', density.topBarHeight + 'px');

    document.documentElement.dataset.mode = theme.mode === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.toggle('compact', !!density.compact);
  }

  root.BITheme = { applyTheme };
})(window);
