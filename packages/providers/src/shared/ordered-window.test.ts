import { describe, expect, it } from "vitest";

import { orderedWindow } from "./ordered-window";

/** A promise a test resolves or rejects by hand, so overlap is observable. */
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: Error) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("orderedWindow", () => {
  it("overlaps the requests but never more than `limit` of them", async () => {
    const gates = [0, 1, 2, 3, 4].map(() => deferred<number>());
    let started = 0;
    let inFlight = 0;
    let peak = 0;

    const window = orderedWindow([0, 1, 2, 3, 4], 3, (item) => {
      started += 1;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      const gate = gates[item];
      if (!gate) throw new Error("no gate");
      return gate.promise.finally(() => {
        inFlight -= 1;
      });
    });

    const iterator = window[Symbol.asyncIterator]();
    const first = iterator.next();
    // The window filled before the first item was handed over, not one at a time.
    expect(started).toBe(3);

    gates[0]?.resolve(0);
    await first;
    // Asking for the next one launches its replacement, and only then.
    const second = iterator.next();
    expect(started).toBe(4);

    gates[1]?.resolve(1);
    await second;
    expect(peak).toBe(3);
  });

  it("yields results in input order however they finish", async () => {
    const gates = [0, 1, 2].map(() => deferred<string>());
    const seen: string[] = [];

    const drain = (async () => {
      for await (const { result } of orderedWindow(["a", "b", "c"], 3, (_, index) => {
        const gate = gates[index];
        if (!gate) throw new Error("no gate");
        return gate.promise;
      })) {
        seen.push(await result);
      }
    })();

    // Last first, first last: the sweep must not reorder around that.
    gates[2]?.resolve("c");
    gates[1]?.resolve("b");
    gates[0]?.resolve("a");
    await drain;

    expect(seen).toEqual(["a", "b", "c"]);
  });

  it("surfaces a failure at its own turn and lets the walk go on", async () => {
    const outcome: string[] = [];

    for await (const { item, result } of orderedWindow([1, 2, 3], 3, (item) =>
      item === 2 ? Promise.reject(new Error("boom")) : Promise.resolve(item),
    )) {
      try {
        outcome.push(String(await result));
      } catch {
        // The consumer's own per-item handling, which is where a sweep reports the
        // failure against the scope it belongs to.
        outcome.push(`failed:${item}`);
      }
    }

    expect(outcome).toEqual(["1", "failed:2", "3"]);
  });

  it("does not let an early rejection escape before its turn", async () => {
    const slow = deferred<number>();
    // Counted rather than captured: what matters is that Node saw none at all.
    let rejections = 0;
    const onRejection = () => {
      rejections += 1;
    };
    process.on("unhandledRejection", onRejection);

    try {
      const iterator = orderedWindow([1, 2], 2, (item) =>
        item === 1 ? slow.promise : Promise.reject(new Error("early")),
      )[Symbol.asyncIterator]();

      const pending = iterator.next();
      // Two macrotask turns: long enough for Node to have flagged an unhandled
      // rejection on item 2, which is still queued behind item 1.
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      slow.resolve(1);
      await pending;

      expect(rejections).toBe(0);
    } finally {
      process.off("unhandledRejection", onRejection);
    }
  });

  it("treats a width below one as a sequential walk", async () => {
    let inFlight = 0;
    let peak = 0;

    for await (const { result } of orderedWindow([1, 2, 3], 0, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return true;
    })) {
      await result;
    }

    expect(peak).toBe(1);
  });

  it("walks an empty list without starting anything", async () => {
    let started = 0;
    for await (const _ of orderedWindow([], 4, () => {
      started += 1;
      return Promise.resolve(true);
    })) {
      throw new Error("nothing should be yielded");
    }
    expect(started).toBe(0);
  });
});
