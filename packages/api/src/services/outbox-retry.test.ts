import { describe, expect, it } from "vitest";

import { MAX_ATTEMPTS, backoffMs, isExhausted } from "./outbox-retry";

/*
 * The attempt counter and the backoff table are read in two different statements and
 * agree only by arithmetic, which is how a queue ends up either retrying forever or
 * giving up on a customer's invitation inside a minute. Both ends are pinned here.
 *
 * `attemptsMade` is the value the claim wrote back, so the first failure sees 1.
 */

const ATTEMPTS = Array.from({ length: MAX_ATTEMPTS }, (_, index) => index + 1);

describe("the retry schedule", () => {
  it("gives every attempt short of the cap a wait to serve", () => {
    const retried = ATTEMPTS.filter((attempts) => !isExhausted(attempts));

    expect(retried).not.toEqual([]);
    for (const attempts of retried) expect(backoffMs(attempts)).toBeGreaterThan(0);
  });

  it("never brings an attempt forward", () => {
    const waits = ATTEMPTS.map(backoffMs);

    expect(waits).toEqual([...waits].sort((a, b) => a - b));
  });

  it("gives up on the last attempt and not before", () => {
    expect(isExhausted(MAX_ATTEMPTS - 1)).toBe(false);
    expect(isExhausted(MAX_ATTEMPTS)).toBe(true);
  });

  /*
   * What the cap costs when it is reached: a mail nobody sends. A schedule that ran out
   * inside an hour would abandon a customer's booking confirmation over a mailer outage
   * shorter than the time it takes anyone to notice one.
   */
  it("outlasts an outage long enough for a person to see it", () => {
    const untilGivenUp = ATTEMPTS.filter((attempts) => !isExhausted(attempts))
      .map(backoffMs)
      .reduce((total, wait) => total + wait, 0);

    expect(untilGivenUp).toBeGreaterThan(6 * 60 * 60 * 1000);
  });

  it("holds at the last step rather than reading past the table", () => {
    expect(backoffMs(MAX_ATTEMPTS * 10)).toBe(backoffMs(MAX_ATTEMPTS - 1));
    // A caller that has not attempted anything yet still gets the first wait, not zero.
    expect(backoffMs(0)).toBe(backoffMs(1));
  });
});
