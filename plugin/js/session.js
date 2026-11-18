/*
 * One streaming search.query at a time. The loop only buffers chunks; DOM
 * work happens in requestAnimationFrame, because a slow consumer makes the
 * SDK abort the stream ("Stream consumer is too slow").
 */
(function (root) {
  'use strict';

  const Host = root.BIHost;

  function createSession() {
    let generation = 0;
    let iterator = null;

    function cancel() {
      generation++;
      const running = iterator;
      iterator = null;
      if (running && typeof running.return === 'function') {
        running.return().catch(function () {});
      }
    }

    /**
     * handlers: onMeta({total, truncated, bookCounts, limit, offset}),
     * onResults(newItems), onDone(), onError(error)
     */
    function start(params, handlers) {
      cancel();
      const mine = ++generation;
      let buffer = [];
      let frame = 0;
      let metaSent = false;

      function flush() {
        frame = 0;
        if (mine !== generation || buffer.length === 0) return;
        const items = buffer;
        buffer = [];
        handlers.onResults(items);
      }

      function schedule() {
        if (!frame) frame = requestAnimationFrame(flush);
      }

      const stream = Host.stream('search.query', params);
      iterator = stream[Symbol.asyncIterator] ? stream[Symbol.asyncIterator]() : stream;

      (async function () {
        try {
          while (true) {
            const step = await iterator.next();
            if (mine !== generation) return;
            if (step.done) break;
            const chunk = step.value || {};
            if (!metaSent || chunk.bookCounts) {
              metaSent = true;
              handlers.onMeta({
                total: chunk.total,
                truncated: !!chunk.truncated,
                bookCounts: chunk.bookCounts || null,
                limit: chunk.limit,
                offset: chunk.offset,
              });
            }
            if (chunk.results && chunk.results.length) {
              buffer.push.apply(buffer, chunk.results);
              schedule();
            }
          }
          if (frame) cancelAnimationFrame(frame);
          flush();
          if (mine === generation) {
            iterator = null;
            handlers.onDone();
          }
        } catch (error) {
          if (mine !== generation) return;
          iterator = null;
          flush();
          handlers.onError(error);
        }
      })();
    }

    return { start, cancel, isRunning: function () { return iterator !== null; } };
  }

  root.BISession = { createSession };
})(window);
