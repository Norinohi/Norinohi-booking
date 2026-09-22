import { readFileSync } from "node:fs";

import {
  availabilitySlot,
  listingFreePeriod,
  listingRefusedPeriod,
} from "@yacht-charter/db/schema/availability";
import { listingSource } from "@yacht-charter/db/schema/listing-source";
import { providerRecord } from "@yacht-charter/db/schema/provider";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { seedListing, seedSearchWorld } from "@yacht-charter/db/test-support/search-fixture";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import { parseExactJson } from "../shared/exact-json";
import type { QueryValue } from "../shared/http-client";
import {
  createDrizzleAvailabilitySyncStore,
  openAvailabilitySyncRun,
  runAvailabilitySync,
} from "../sync/availability-writer";
import type { BookingManagerClient } from "./client";
import { type BookingManagerConfig, resolveBookingManagerConfig } from "./config";
import { bookingManagerEndpoints } from "./endpoints";
import { createBookingManagerAvailabilitySource } from "./occupancy";

/*
 * N25, on company 225's own answers: Alien carries a /prices rate for 05.06.2027 (4,600) and
 * has no /availability row all year, so a price list and occupancy alone make it a free, priced
 * boat. /offers never sells it. The confirming sweep has to turn that silence into a refusal,
 * or the week is advertised and bookable on the strength of a rate nobody sells. Giulia is
 * offered the same week and Franca is booked across it, the two cases that must not be refused.
 */

const ALIEN = "72857820000100225";
const GIULIA = "7078608780000100225";
const FRANCA = "7078642060000100225";
const WEEK = { startDate: "2027-06-05", endDate: "2027-06-12" };

const config: BookingManagerConfig = resolveBookingManagerConfig({
  BOOKING_MANAGER_BASE_URL: "https://www.booking-manager.com/api/v2",
  BOOKING_MANAGER_API_KEY: "t0ken",
  BOOKING_MANAGER_TIMEOUT_MS: 30_000,
  BOOKING_MANAGER_SYNC_TIMEOUT_MS: 180_000,
  BOOKING_MANAGER_MIN_INTERVAL_MS: 0,
  BOOKING_MANAGER_SWEEP_CONCURRENCY: 2,
  BOOKING_MANAGER_PRICE_WEEKS_CONCURRENCY: 2,
  BOOKING_MANAGER_OPTION_SAFETY_MARGIN_MINUTES: 15,
  BOOKING_MANAGER_TIMEZONE: "Europe/Zagreb",
});

const fixture = (name: string) =>
  parseExactJson(readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8"));

/* Answers the two dumps from the recorded payloads and every other week with nothing sold. */
function recordedClient(): BookingManagerClient {
  const offers = fixture("offers-225-2027-06-05.json");
  const availability = fixture("availability-225-2027.json");
  // SAFETY: a stub carrying only what the source calls; anything else is a TypeError.
  return Object.assign({} as BookingManagerClient, {
    get: <T>(
      endpoint: string,
      schema: z.ZodType<T>,
      query: Record<string, QueryValue | undefined> = {},
    ) => {
      if (endpoint === bookingManagerEndpoints.availability(2027)) {
        return Promise.resolve(schema.parse(availability));
      }
      if (endpoint === bookingManagerEndpoints.offers) {
        const asked = String(query.dateFrom).slice(0, 10);
        return Promise.resolve(schema.parse(asked === WEEK.startDate ? offers : []));
      }
      return Promise.resolve(schema.parse([]));
    },
    sweepLane: (name: string, slot: number) => ({ queueKey: `${name}#${slot}` }),
  });
}

let test: TestDatabase;

async function seedYacht(slug: string, externalYachtId: string) {
  await seedListing(test.db, slug, {
    providerId: "prov_bm",
    free: { from: "2027-01-01", to: "2028-01-01" },
  });
  await test.db
    .update(providerRecord)
    .set({ externalId: externalYachtId })
    .where(eq(providerRecord.id, `prec_${slug}`));
  await test.db
    .update(listingSource)
    .set({ externalYachtId, externalCompanyId: "225" })
    .where(eq(listingSource.id, `lsrc_${slug}`));
}

beforeAll(async () => {
  test = await createTestDatabase();
  await seedSearchWorld(test.db);
  await seedYacht("alien", ALIEN);
  await seedYacht("giulia", GIULIA);
  await seedYacht("franca", FRANCA);
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

describe("a yacht /prices prices and /offers never sells", () => {
  it("is refused for the swept week instead of being left free and priced", async () => {
    const syncRunId = await openAvailabilitySyncRun(test.db, "prov_bm");
    const summary = await runAvailabilitySync({
      store: createDrizzleAvailabilitySyncStore({ db: test.db, providerId: "prov_bm", syncRunId }),
      source: createBookingManagerAvailabilitySource({
        client: recordedClient(),
        config,
        years: [2027],
        companyIds: [225],
        today: "2027-06-01",
      }),
      now: () => new Date("2027-06-01T02:00:00.000Z"),
      hotWindowBudgetMs: 60_000,
    });
    expect(summary.aborted).toBe(false);

    const refused = await test.db
      .select({ listingId: listingRefusedPeriod.listingId })
      .from(listingRefusedPeriod)
      .where(
        and(
          eq(listingRefusedPeriod.startDate, WEEK.startDate),
          eq(listingRefusedPeriod.endDate, WEEK.endDate),
        ),
      );
    expect(refused.map((row) => row.listingId)).toEqual(["lst_alien"]);

    // Still free by occupancy, which is exactly why the refusal is what keeps it off sale.
    const alienFree = await test.db
      .select({ startDate: listingFreePeriod.startDate })
      .from(listingFreePeriod)
      .where(eq(listingFreePeriod.listingId, "lst_alien"));
    expect(alienFree).not.toHaveLength(0);

    const giulia = await test.db
      .select({ status: availabilitySlot.status, priceMinor: availabilitySlot.priceMinor })
      .from(availabilitySlot)
      .where(
        and(
          eq(availabilitySlot.listingId, "lst_giulia"),
          eq(availabilitySlot.startDate, WEEK.startDate),
        ),
      );
    expect(giulia).toEqual([{ status: "available", priceMinor: expect.any(Number) }]);
  });
});
