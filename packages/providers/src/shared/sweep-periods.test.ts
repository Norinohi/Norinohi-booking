import { describe, expect, it } from "vitest";

import {
  ADVERTISED_HEAD_LIMIT,
  ADVERTISED_TAIL_PER_RUN,
  sweepPlan,
  sweepRotation,
  type SweepPeriod,
} from "./sweep-periods";

const TODAY = "2026-08-31";

/** `count` distinct future charters, in the most-advertised-first order the caller supplies. */
const periods = (count: number): SweepPeriod[] =>
  Array.from({ length: count }, (_, index) => {
    const day = new Date(Date.UTC(2026, 8, 1) + index * 86_400_000);
    const checkIn = day.toISOString().slice(0, 10);
    return {
      startDate: checkIn,
      endDate: new Date(day.getTime() + 86_400_000).toISOString().slice(0, 10),
    };
  });

const starts = (list: readonly SweepPeriod[]) => list.map((period) => period.startDate);

describe("sweepPlan", () => {
  it("walks every advertised period when they fit in the head", () => {
    const advertised = periods(ADVERTISED_HEAD_LIMIT);
    const plan = sweepPlan(advertised, [], { today: TODAY });

    expect(starts(plan.advertised)).toEqual(starts(advertised));
  });

  /*
   * The bug this rations away. The read model was asked for sixty periods and swept the sixty,
   * so the 278 periods behind them -- 470 dated cards between the two vendors -- were never
   * priced on any run, and every one of those cards advertised a charter with a season floor
   * beside it rather than the charter's own price.
   */
  it("reaches every period behind the head across successive runs", () => {
    const advertised = periods(ADVERTISED_HEAD_LIMIT + ADVERTISED_TAIL_PER_RUN * 3);
    const seen = new Set<string>();

    for (let rotation = 0; rotation < 3; rotation += 1) {
      for (const period of sweepPlan(advertised, [], { today: TODAY, rotation }).advertised) {
        seen.add(period.startDate);
      }
    }

    expect([...seen].sort()).toEqual(starts(advertised).sort());
  });

  /* The head is the visible surface, so it is re-asked whatever the rotation is doing. */
  it("keeps the head in every run", () => {
    const advertised = periods(ADVERTISED_HEAD_LIMIT + ADVERTISED_TAIL_PER_RUN * 2);
    const head = starts(advertised.slice(0, ADVERTISED_HEAD_LIMIT));

    for (const rotation of [0, 1, 7, 500]) {
      const plan = sweepPlan(advertised, [], { today: TODAY, rotation });
      expect(starts(plan.advertised).slice(0, ADVERTISED_HEAD_LIMIT)).toEqual(head);
    }
  });

  it("takes a different slice of the tail on the next run", () => {
    const advertised = periods(ADVERTISED_HEAD_LIMIT + ADVERTISED_TAIL_PER_RUN * 2);
    const tailOf = (rotation: number) =>
      starts(sweepPlan(advertised, [], { today: TODAY, rotation }).advertised).slice(
        ADVERTISED_HEAD_LIMIT,
      );

    expect(tailOf(0)).not.toEqual(tailOf(1));
    expect(tailOf(0)).toHaveLength(ADVERTISED_TAIL_PER_RUN);
    expect(tailOf(1)).toHaveLength(ADVERTISED_TAIL_PER_RUN);
  });

  /*
   * The tail is a ring, not a queue. A rotation that has run past the end has to come back to
   * the front: the clock it counts never resets, so anything that ran short at the end would
   * stop sweeping the tail entirely after the first cycle.
   */
  it("wraps the tail rather than running out of it", () => {
    const advertised = periods(ADVERTISED_HEAD_LIMIT + ADVERTISED_TAIL_PER_RUN);
    const tailOf = (rotation: number) =>
      starts(sweepPlan(advertised, [], { today: TODAY, rotation }).advertised).slice(
        ADVERTISED_HEAD_LIMIT,
      );

    expect(tailOf(1)).toEqual(tailOf(0));
    expect(tailOf(1)).toHaveLength(ADVERTISED_TAIL_PER_RUN);
  });

  /* The grid queues behind the advertised half however that half was chosen. */
  it("leaves the grid behind the advertised periods", () => {
    const plan = sweepPlan(periods(ADVERTISED_HEAD_LIMIT + 5), [{ ...periods(1)[0]! }], {
      today: TODAY,
      rotation: 3,
    });

    expect(plan.advertised.every((period) => period.source === "advertised")).toBe(true);
    expect(plan.grid.every((period) => period.source === "grid")).toBe(true);
  });

  it("drops a period that has already ended before it is ever rationed", () => {
    const plan = sweepPlan([{ startDate: "2026-08-01", endDate: "2026-08-08" }], [], {
      today: TODAY,
    });

    expect(plan.advertised).toEqual([]);
  });
});

describe("sweepRotation", () => {
  /* One step per hour, which is the schedule the availability cron actually runs on. */
  it("advances once an hour", () => {
    const at = (iso: string) => sweepRotation(new Date(iso));

    expect(at("2026-09-07T10:59:59.000Z")).toBe(at("2026-09-07T10:00:00.000Z"));
    expect(at("2026-09-07T11:00:00.000Z")).toBe(at("2026-09-07T10:00:00.000Z") + 1);
  });
});
