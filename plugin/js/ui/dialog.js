/*
 * Modal dialog, anchored popover and prompt, styled like Otzaria's
 * AppDialogFrame: flat surface, outline border, radius 8, no shadow.
 */
(function (root) {
  'use strict';

  const D = root.BIDom;
  const h = D.h;
  let openCount = 0;

  /**
   * openDialog({ title, size: 'sm'|'md'|'lg', body, actions, onClose, initialFocus })
   * actions: [{ label, variant, onclick(close), disabled, title, icon }]
   * Returns { close, el, setActions }.
   */
  function openDialog(opts) {
    const previousFocus = document.activeElement;
    const scrim = h('div', { class: 'dialog-scrim' });
    const footer = h('div', { class: 'dialog-actions' });
    const panel = h('section', {
      class: 'dialog dialog-' + (opts.size || 'md'),
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': opts.title,
    },
      h('header', { class: 'dialog-header' },
        h('h2', { class: 'dialog-title' }, opts.title),
        D.iconButton('close', 'סגירה', function () { close(); })),
      h('div', { class: 'dialog-body' }, opts.body),
      footer);
    scrim.appendChild(panel);

    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      openCount--;
      scrim.remove();
      document.removeEventListener('keydown', onKey, true);
      if (opts.onClose) opts.onClose(result);
      if (previousFocus && previousFocus.focus) previousFocus.focus();
    }

    function setActions(actions) {
      D.clear(footer);
      (actions || []).forEach(function (action) {
        if (action === 'spacer') {
          footer.appendChild(h('span', { class: 'spacer' }));
          return;
        }
        footer.appendChild(D.button(action.label, {
          variant: action.variant || 'tonal',
          icon: action.icon,
          title: action.title,
          disabled: action.disabled,
          onclick: function () { action.onclick ? action.onclick(close) : close(); },
        }));
      });
    }

    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === 'Tab') {
        trapFocus(event, panel);
      }
    }

    setActions(opts.actions);
    scrim.addEventListener('mousedown', function (event) {
      if (event.target === scrim) close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(scrim);
    openCount++;
    const focusTarget = opts.initialFocus || panel.querySelector('input, select, textarea, .list [tabindex="0"], button:not(.icon-btn)');
    if (focusTarget) focusTarget.focus();
    return { close, el: panel, setActions };
  }

  function trapFocus(event, container) {
    const items = Array.prototype.filter.call(
      container.querySelectorAll('button, input, select, textarea, [tabindex="0"]'),
      function (el) { return !el.disabled && el.offsetParent !== null; }
    );
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /** Simple text prompt; resolves to the trimmed text or null. */
  function prompt(title, label, initial) {
    return new Promise(function (resolve) {
      let value = null;
      const input = h('input', { class: 'input', type: 'text', value: initial || '', 'aria-label': label });
      const body = h('label', { class: 'field-label' }, h('span', null, label), input);
      const dlg = openDialog({
        title,
        size: 'sm',
        body,
        initialFocus: input,
        onClose: function () { resolve(value); },
        actions: [
          'spacer',
          { label: 'ביטול' },
          { label: 'אישור', variant: 'filled', onclick: submit },
        ],
      });
      function submit(close) {
        const text = input.value.trim();
        if (!text) {
          input.focus();
          return;
        }
        value = text;
        close();
      }
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          submit(dlg.close);
        }
      });
    });
  }

  /** Popover anchored under `anchor`; items: [{ label, icon, onclick, disabled, title }]. */
  function openMenu(anchor, items) {
    const menu = h('div', { class: 'menu', role: 'menu' });
    let close = function () {};
    items.forEach(function (item) {
      if (item === 'divider') {
        menu.appendChild(h('div', { class: 'menu-divider', role: 'separator' }));
        return;
      }
      menu.appendChild(h('button', {
        type: 'button',
        class: 'menu-item',
        role: 'menuitem',
        disabled: item.disabled,
        title: item.title,
        onclick: function () { close(); item.onclick(); },
      }, item.icon ? D.icon(item.icon) : null, h('span', null, item.label)));
    });
    close = openPopover(anchor, menu);
    return close;
  }

  /** Places `content` as a popover below `anchor`; returns a close function. */
  function openPopover(anchor, content, onClosed) {
    content.classList.add('popover');
    document.body.appendChild(content);
    const rect = anchor.getBoundingClientRect();
    const width = content.offsetWidth;
    const right = Math.max(8, window.innerWidth - rect.right);
    const maxRight = Math.max(8, window.innerWidth - width - 8);
    content.style.insetInlineStart = 'auto';
    content.style.right = Math.min(right, maxRight) + 'px';
    const below = rect.bottom + 4;
    const above = rect.top - content.offsetHeight - 4;
    content.style.top = (below + content.offsetHeight > window.innerHeight && above > 0 ? above : below) + 'px';
    function close() {
      content.remove();
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', key, true);
      if (onClosed) onClosed();
    }
    function outside(event) {
      if (!content.contains(event.target) && !anchor.contains(event.target)) close();
    }
    function key(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        anchor.focus();
      }
    }
    setTimeout(function () {
      document.addEventListener('mousedown', outside, true);
      document.addEventListener('keydown', key, true);
    }, 0);
    const first = content.querySelector('button:not([disabled]), input');
    if (first) first.focus();
    return close;
  }

  root.BIDialog = {
    openDialog,
    prompt,
    openMenu,
    openPopover,
    isOpen: function () { return openCount > 0; },
  };
})(window);
