import { describe, expect, it } from "vitest";

import { queueForInterval, SequentialQueue, sharedQueue } from "./queue";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("SequentialQueue", () => {
  it("never runs two tasks on the same key at once", async () => {
    const queue = new SequentialQueue();
    let active = 0;
    let peak = 0;
    const order: number[] = [];

    const task = (id: number) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await delay(5);
      order.push(id);
      active -= 1;
      return id;
    };

    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((id) => queue.run("nausys:agency", task(id))),
    );

    expect(peak).toBe(1);
    expect(order).toEqual([1, 2, 3, 4, 5]);
    expect(results).toEqual([1, 2, 3, 4, 5]);
  });

  it("runs different keys concurrently", async () => {
    const queue = new SequentialQueue();
    let active = 0;
    let peak = 0;

    const task = async () => {
      active += 1;
      peak = Math.max(peak, active);
      await delay(10);
      active -= 1;
    };

    await Promise.all([
      queue.run("nausys:agency", task),
      queue.run("nausys:sync", task),
      queue.run("booking_manager:agency", task),
    ]);

    expect(peak).toBe(3);
  });

  it("does not wedge the chain when a task rejects", async () => {
    const queue = new SequentialQueue();
    const failing = queue.run("key", () => Promise.reject(new Error("boom")));

    await expect(failing).rejects.toThrow("boom");
    await expect(queue.run("key", () => Promise.resolve("after"))).resolves.toBe("after");

    const settled = await Promise.allSettled([
      queue.run("key", () => Promise.reject(new Error("first"))),
      queue.run("key", () => Promise.resolve("second")),
      queue.run("key", () => Promise.reject(new Error("third"))),
      queue.run("key", () => Promise.resolve("fourth")),
    ]);

    expect(settled.map((entry) => entry.status)).toEqual([
      "rejected",
      "fulfilled",
      "rejected",
      "fulfilled",
    ]);
  });

  it("spaces tasks by minIntervalMs measured from the previous finish", async () => {
    let clock = 0;
    const slept: number[] = [];
    const queue = new SequentialQueue({
      minIntervalMs: 1000,
      now: () => clock,
      sleep: async (ms) => {
        slept.push(ms);
        clock += ms;
      },
    });

    await queue.run("key", async () => {
      clock += 100;
    });
    await queue.run("key", async () => {
      clock += 100;
    });
    clock += 5000;
    await queue.run("key", async () => undefined);

    // First task waits for nothing; second waits the full interval; the third
    // needs no wait because more than the interval already elapsed.
    expect(slept).toEqual([1000]);
  });

  it("releases keys once drained", async () => {
    const queue = new SequentialQueue();
    await queue.run("key", () => Promise.resolve(1));
    await delay(0);

    expect(queue.activeKeys()).toBe(0);
  });

  it("exposes a module-scoped instance so separate providers still serialize", async () => {
    expect(sharedQueue).toBeInstanceOf(SequentialQueue);
    await expect(sharedQueue.run("shared-key", () => Promise.resolve("ok"))).resolves.toBe("ok");
  });

  it("pools one instance per interval and reuses it", () => {
    expect(queueForInterval(0)).toBe(sharedQueue);
    expect(queueForInterval(750)).toBe(queueForInterval(750));
    expect(queueForInterval(750)).not.toBe(queueForInterval(900));
  });

  it("does not serialize two different keys against each other", async () => {
    // The pooled instance is shared across providers, so this pins that the
    // provider-namespaced keys still get independent lanes.
    const queue = queueForInterval(400);
    const finished: string[] = [];

    const slow = queue.run("nausys:agency-user", async () => {
      await delay(20);
      finished.push("nausys");
    });
    const fast = queue.run("booking_manager:abc123", () => {
      finished.push("booking_manager");
      return Promise.resolve();
    });

    await Promise.all([slow, fast]);

    expect(finished).toEqual(["booking_manager", "nausys"]);
  });
});
