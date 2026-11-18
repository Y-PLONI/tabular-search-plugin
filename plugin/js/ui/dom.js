/*
 * Small DOM helpers and the inline SVG icon set (stroke = currentColor, so
 * icons follow the theme). Otzaria does not render icons inside a plugin page.
 */
(function (root) {
  'use strict';

  /** h('button', { class: 'x', onclick: fn, title: 't' }, 'text', child) */
  function h(tag, attrs) {
    const el = document.createElement(tag);
    const props = attrs || {};
    Object.keys(props).forEach(function (key) {
      const value = props[key];
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') el.className = value;
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key.slice(0, 2) === 'on' && typeof value === 'function') {
        el.addEventListener(key.slice(2), value);
      } else if (key === 'value') el.value = value;
      else if (key === 'checked') el.checked = !!value;
      else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    });
    for (let i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  function append(parent, child) {
    if (child === undefined || child === null || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(parent, c); });
      return;
    }
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';

  // 24×24 outline paths drawn for this plugin.
  const ICONS = {
    search: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20',
    table: 'M4 5h16v14H4zM4 10h16M4 14.5h16M9.3 5v14M14.7 5v14',
    flash: 'M13 3 6 13h5l-1 8 7-10h-5z',
    code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14',
    chat: 'M4 5h16v11H9l-4 3v-3H4zM8 9.5h8M8 12.5h5',
    library: 'M4 4h3v16H4zM9 4h3v16H9zM14.2 5.1l2.9-.8 3.9 15.3-2.9.8z',
    history: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4.5l3 2',
    star: 'M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6-4.1-3.9 5.6-.7z',
    family: 'M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c.5-3.2 2.7-5 5.5-5s5 1.8 5.5 5M16 11a2.5 2.5 0 1 0 0-5M17.5 14c2 .4 3.2 2 3.5 4.5',
    bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.6 9.2a2.5 2.5 0 1 1 3.4 2.4c-.6.3-1 .8-1 1.5v.6M12 16.6v.4',
    keyboard: 'M3 7h18v10H3zM6.5 10h1M9.5 10h1M12.5 10h1M15.5 10h1M8 14h8',
    both: 'M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4',
    forward: 'M20 12H4M8 8l-4 4 4 4',
    close: 'M6 6l12 12M18 6 6 18',
    open: 'M4 6.5C6.5 5.2 9.5 5.2 12 7c2.5-1.8 5.5-1.8 8-.5V19c-2.5-1.3-5.5-1.3-8 .5-2.5-1.8-5.5-1.8-8-.5zM12 7v12.5',
    side: 'M3 5h18v14H3zM10 5v14',
    stop: 'M7 7h10v10H7z',
    prev: 'M9 6l6 6-6 6',
    next: 'M15 6l-6 6 6 6',
    back: 'M5 12h14M15 8l4 4-4 4',
    save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
    trash: 'M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13',
    add: 'M12 5v14M5 12h14',
    erase: 'M8 20h12M4.5 15.5l9-9 5 5-6.5 6.5H8.5z',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    chevron: 'M8 10l4 4 4-4',
    filter: 'M4 5h16l-6 7.5V19l-4-2v-4.5z',
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    niqqud: 'M6 8h12M9 4h6M8 12h8v8M8 16h8',
    more: 'M6 12h.01M12 12h.01M18 12h.01',
  };

  function icon(name, extraClass) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'icon' + (extraClass ? ' ' + extraClass : ''));
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[name] || ICONS.help);
    svg.appendChild(path);
    return svg;
  }

  /** Icon-only button: always with tooltip and accessible name. */
  function iconButton(name, label, onclick, extraClass) {
    return h('button', {
      type: 'button',
      class: 'icon-btn' + (extraClass ? ' ' + extraClass : ''),
      title: label,
      'aria-label': label,
      onclick,
    }, icon(name));
  }

  function button(label, opts) {
    const o = opts || {};
    return h('button', {
      type: 'button',
      class: 'btn ' + (o.variant || 'tonal') + (o.class ? ' ' + o.class : ''),
      title: o.title,
      disabled: o.disabled,
      onclick: o.onclick,
      'aria-disabled': o.disabled ? 'true' : null,
    }, o.icon ? icon(o.icon) : null, h('span', { class: 'btn-label' }, label));
  }

  /** Whitelist renderer for search snippets: text + <b>/<strong>/<mark>/<em>/<i>/<br>. */
  function safeSnippet(html) {
    const template = document.createElement('template');
    template.innerHTML = String(html || '');
    const out = document.createDocumentFragment();
    (function copy(from, to) {
      from.childNodes.forEach(function (node) {
        if (node.nodeType === 3) {
          to.appendChild(document.createTextNode(node.nodeValue));
        } else if (node.nodeType === 1) {
          const tag = node.tagName.toLowerCase();
          if (tag === 'br') to.appendChild(document.createElement('br'));
          else if (tag === 'b' || tag === 'strong' || tag === 'mark') {
            const mark = document.createElement('mark');
            copy(node, mark);
            to.appendChild(mark);
          } else if (tag === 'em' || tag === 'i') {
            const em = document.createElement('em');
            copy(node, em);
            to.appendChild(em);
          } else if (tag !== 'script' && tag !== 'style' && tag !== 'template') copy(node, to);
        }
      });
    })(template.content, out);
    return out;
  }

  function debounce(fn, ms) {
    let timer = 0;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, ms);
    };
  }

  /** Inserts text at the caret of an input and fires `input`. */
  function insertAtCaret(input, text) {
    const start = input.selectionStart == null ? input.value.length : input.selectionStart;
    const end = input.selectionEnd == null ? start : input.selectionEnd;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    const caret = start + text.length;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  /** Bar-Ilan syntax with each token bidi-isolated, so operators stay next to their word. */
  function syntaxNode(text) {
    const code = h('code', { class: 'syntax', dir: 'rtl' });
    String(text || '').split(/\s+/).filter(Boolean).forEach(function (token, i) {
      if (i) code.appendChild(document.createTextNode(' '));
      code.appendChild(h('span', { class: 'syntax-token', dir: /^[\[\d]/.test(token) ? 'ltr' : null }, token));
    });
    return code;
  }

  root.BIDom = { h, clear, icon, iconButton, button, safeSnippet, debounce, insertAtCaret, syntaxNode };
})(window);
