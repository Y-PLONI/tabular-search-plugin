/*
 * Thin wrapper around window.Otzaria: promise calls that throw a HostError,
 * Hebrew texts for error codes, and user notices.
 */
(function (root) {
  'use strict';

  const ERROR_TEXTS = {
    'error.invalid_params': 'אוצריא דחתה את הבקשה (פרמטר לא תקין).',
    'error.timeout': 'החיפוש רחב מדי והופסק. צמצמו את המאגרים או הוסיפו מרכיבים.',
    'error.not_found': 'ספר שנבחר במאגרים לא נמצא בספרייה. עדכנו את בחירת המאגרים.',
    'error.forbidden': 'לתוסף אין הרשאה לפעולה זו.',
    'error.rate_limited': 'יותר מדי בקשות בזמן קצר. נסו שוב בעוד רגע.',
    'error.unavailable': 'השירות אינו זמין כרגע.',
  };

  class HostError extends Error {
    constructor(code, message) {
      super(message || code);
      this.code = code || 'error.internal';
    }
  }

  function sdk() {
    if (!root.Otzaria) throw new HostError('error.unavailable', 'Otzaria SDK missing');
    return root.Otzaria;
  }

  /** Calls a host method and returns `data`; throws HostError on failure. */
  async function call(method, payload) {
    let response;
    try {
      response = await sdk().call(method, payload || {});
    } catch (error) {
      throw new HostError('error.internal', error && error.message);
    }
    if (!response || response.success !== true) {
      const err = (response && response.error) || {};
      throw new HostError(err.code, err.message);
    }
    return response.data;
  }

  /** search.query returns an AsyncIterable directly, not a promise. */
  function stream(method, payload) {
    return sdk().call(method, payload || {});
  }

  function on(event, handler) {
    sdk().on(event, handler);
  }

  /** Hebrew text for an error from call() or from a stream iterator. */
  function describeError(error) {
    if (error && ERROR_TEXTS[error.code]) return ERROR_TEXTS[error.code];
    const message = String((error && error.message) || '');
    if (/too slow/i.test(message)) return 'הזרם נקטע (התוצאות הגיעו מהר מדי). נסו שוב.';
    if (/timeout/i.test(message)) return ERROR_TEXTS['error.timeout'];
    if (/not.?found/i.test(message)) return ERROR_TEXTS['error.not_found'];
    if (/invalid/i.test(message)) return ERROR_TEXTS['error.invalid_params'];
    if (/not ready/i.test(message)) return 'אוצריא עדיין טוענת את התוסף. נסו שוב בעוד רגע.';
    return 'החיפוש נכשל. נסו שוב.';
  }

  function notify(message) {
    return call('ui.showMessage', { message }).catch(function () {});
  }

  function notifyError(message) {
    return call('ui.showError', { message }).catch(function () {});
  }

  root.BIHost = { call, stream, on, describeError, notify, notifyError, HostError };
})(window);
