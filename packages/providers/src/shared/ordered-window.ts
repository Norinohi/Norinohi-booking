/**
 * Runs `start` over `items` with up to `limit` of them in flight, and hands the
 * results back in the order the items came in.
 *
 * The order is the whole point. A sweep that walks a list and saves its position
 * as a resume cursor may overlap the requests freely, but it may not finish them
 * out of order: a cursor written for item 40 while 37 is still in flight promises
 * the next run that 37 landed. Yielding strictly in order keeps that promise and
 * costs only the head-of-line wait, which is also what bounds the memory - a slow
 * item holds at most `limit` payloads behind it.
 *
 * Failures are not caught here. The rejection travels on the yielded promise and
 * surfaces when the consumer awaits it at that item's turn, so a per-item
 * `try`/`catch` around the await reports against the right item and reports
 * nothing for items the consumer never reaches.
 */
export async function* orderedWindow<T, R>(
  items: Iterable<T>,
  limit: number,
  start: (item: T, index: number) => Promise<R>,
): AsyncGenerator<{ index: number; item: T; result: Promise<R> }> {
  const width = Math.max(1, Math.trunc(limit));
  const window: Array<{ index: number; item: T; result: Promise<R> }> = [];
  const source = items[Symbol.iterator]();
  let launched = 0;

  const fill = () => {
    while (window.length < width) {
      const next = source.next();
      if (next.done === true) return;
      const index = launched;
      launched += 1;
      const result = start(next.value, index);
      /*
       * Attached at launch rather than at the yield. A request that fails while its
       * turn is still behind a slower neighbour would otherwise be an unhandled
       * rejection, which Node exits the process over - and this sweep is the one
       * place where a single vendor 500 must not take the whole run down.
       */
      void result.catch(() => undefined);
      window.push({ index, item: next.value, result });
    }
  };

  for (;;) {
    fill();
    const next = window.shift();
    if (next === undefined) return;
    yield next;
  }
}
