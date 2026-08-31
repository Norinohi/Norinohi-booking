import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import type { BookingManagerClient } from "./client";
import { type BookingManagerConfig, resolveBookingManagerConfig } from "./config";
import type { RestOffer } from "./endpoints";
import { streamBookingManagerConfirmedOffers } from "./confirmed-offers";

const config: BookingManagerConfig = resolveBookingManagerConfig({
  BOOKING_MANAGER_BASE_URL: "https://www.booking-manager.com/api/v2",
  BOOKING_MANAGER_API_KEY: "t0ken",
  BOOKING_MANAGER_TIMEOUT_MS: 30_000,
  BOOKING_MANAGER_MIN_INTERVAL_MS: 0,
  BOOKING_MANAGER_SWEEP_CONCURRENCY: 2,
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: 15,
  BOOKING_MANAGER_TIMEZONE: "Europe/Zagreb",
});

type Query = { dateFrom?: unknown; dateTo?: unknown };

/** Records the periods that actually reach the vendor, which is what this pass chooses. */
function recordingClient() {
  const asked: { from: string; to: string }[] = [];
  // SAFETY: a stub with nothing behind it; any method these paths do not use is absent, so
  // reaching for one is a TypeError rather than a wrong answer.
  const client = Object.assign({} as BookingManagerClient, {
    sweepLane: () => ({}),
    get: (_endpoint: string, _schema: z.ZodType<RestOffer[]>, query?: Query) => {
      asked.push({
        from: String(query?.dateFrom).slice(0, 10),
        to: String(query?.dateTo).slice(0, 10),
      });
      return Promise.resolve([]);
    },
  });
  return { client, asked };
}

async function sweep(options: {
  advertised?: { startDate: string; endDate: string }[];
  today: string;
  years?: number[];
  weekIndex?: number;
}) {
  const { client, asked } = recordingClient();
  const pages = [];
  for await (const page of streamBookingManagerConfirmedOffers(
    {
      client,
      config,
      companyIds: [],
      years: options.years ?? [2026],
      today: options.today,
      ...(options.advertised
        ? { loadAdvertisedPeriods: () => Promise.resolve(options.advertised ?? []) }
        : null),
    },
    { weekIndex: options.weekIndex ?? 0 },
  )) {
    pages.push(page);
  }
  return { asked, pages };
}

/*
 * The pass is budgeted and resumes by counting periods already walked, so the front of the
 * list decides what gets priced at all. A week it never reaches keeps the price the catalogue
 * reconstruction gives it, which misses whatever only the offer states — a mandatory Turkish
 * VAT line put a gulet card at EUR 35,000 beside a EUR 42,000 quote.
 */
describe("the periods the confirming sweep asks about", () => {
  it("asks about the weeks the cards advertise first", async () => {
    const { asked } = await sweep({
      advertised: [{ startDate: "2026-10-03", endDate: "2026-10-10" }],
      today: "2026-08-31",
    });

    expect(asked[0]).toEqual({ from: "2026-10-03", to: "2026-10-10" });
  });

  it("asks about an advertised charter no Saturday grid would name", async () => {
    const { asked } = await sweep({
      advertised: [{ startDate: "2026-10-06", endDate: "2026-10-10" }],
      today: "2026-08-31",
    });

    expect(asked[0]).toEqual({ from: "2026-10-06", to: "2026-10-10" });
  });

  it("never asks about a week that is already over", async () => {
    const { asked } = await sweep({ today: "2026-08-31" });

    expect(asked.length).toBeGreaterThan(0);
    for (const period of asked) expect(period.to > "2026-08-31").toBe(true);
  });

  it("still sweeps the charter Saturdays behind them", async () => {
    const { asked } = await sweep({
      advertised: [{ startDate: "2026-10-06", endDate: "2026-10-10" }],
      today: "2026-08-31",
    });

    expect(asked).toContainEqual({ from: "2026-09-05", to: "2026-09-12" });
  });

  it("asks once for a week both the cards and the grid name", async () => {
    const week = { from: "2026-09-05", to: "2026-09-12" };
    const { asked } = await sweep({
      advertised: [{ startDate: week.from, endDate: week.to }],
      today: "2026-08-31",
    });

    expect(asked.filter((period) => period.from === week.from)).toHaveLength(1);
  });

  /* The cursor counts periods walked, so a resumed run must not re-ask the front of the list. */
  it("resumes past the periods a previous run already swept", async () => {
    const first = await sweep({ today: "2026-08-31" });
    const resumed = await sweep({ today: "2026-08-31", weekIndex: 2 });

    expect(resumed.asked[0]).toEqual(first.asked[2]);
  });

  it("reports each period it swept, so a yacht's absence can be read as a refusal", async () => {
    const { pages } = await sweep({
      advertised: [{ startDate: "2026-10-03", endDate: "2026-10-10" }],
      today: "2026-08-31",
    });

    expect(pages[0]?.swept).toMatchObject({ startDate: "2026-10-03", endDate: "2026-10-10" });
  });
});
