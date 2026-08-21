import { describe, expect, it } from "vitest";

import { runPooled } from "./pooled";

/** Resolves when told to, so a test can hold work in flight and count it. */
function deferred() {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { promise, release: resolve };
}

describe("runPooled", () => {
  it("keeps at most `limit` tasks in flight", async () => {
    const gates = Array.from({ length: 6 }, deferred);
    let inFlight = 0;
    let peak = 0;

    const done = runPooled([0, 1, 2, 3, 4, 5], 2, async (index) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await gates[index]?.promise;
      inFlight -= 1;
    });

    for (const gate of gates) {
      // One microtask turn per release, so the workers can claim the next item.
      gate.release();
      await Promise.resolve();
    }

    await done;
    expect(peak).toBe(2);
  });

  it("runs every item exactly once", async () => {
    const seen: number[] = [];
    await runPooled([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      await Promise.resolve();
      seen.push(item);
    });

    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("stops claiming work once a task throws, and rejects", async () => {
    const started: number[] = [];

    await expect(
      runPooled([1, 2, 3, 4, 5, 6, 7, 8], 1, async (item) => {
        started.push(item);
        await Promise.resolve();
        if (item === 3) throw new Error("chunk 3 failed");
      }),
    ).rejects.toThrow("chunk 3 failed");

    expect(started).toEqual([1, 2, 3]);
  });

  it("does nothing with an empty list rather than spawning a worker", async () => {
    let calls = 0;
    await runPooled([], 4, async () => {
      calls += 1;
      await Promise.resolve();
    });

    expect(calls).toBe(0);
  });
});
