/**
 * Runs `task` over `items` with at most `limit` of them in flight.
 *
 * For statements, not for vendor calls. `orderedWindow` is the one to reach for
 * when a sweep's order is load-bearing - it exists so a resume cursor never
 * outruns a slower neighbour - and this one is deliberately unordered, because
 * what it parallelises is a chunk of an idempotent multi-row upsert and there is
 * no order between chunks to keep.
 *
 * The pool behind `db` is what bounds this in practice: node-postgres hands out
 * ten clients by default, so a limit near that starves the run's own progress
 * poller and error recorder of a connection.
 *
 * The first rejection wins and the workers stop pulling. Chunks already in flight
 * still land, which is fine for an upsert - a partially written batch is a batch
 * the next run rewrites - and the throw travels to the caller either way.
 */
export async function runPooled<T>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const width = Math.max(1, Math.min(Math.trunc(limit), items.length));

  // One iterator shared by every worker: `next()` is synchronous, so pulling from
  // it is how each worker claims the next chunk without an index to race over.
  const queue = items.entries();

  await Promise.all(
    Array.from({ length: width }, async () => {
      for (const [index, item] of queue) {
        await task(item, index);
      }
    }),
  );
}
