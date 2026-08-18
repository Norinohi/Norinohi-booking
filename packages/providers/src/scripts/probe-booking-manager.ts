/**
 * Read-only Booking Manager contract probe.
 *
 * Fetches each catalogue endpoint through the real client and parses it with the
 * schema the connector actually uses, so a field the vendor names differently
 * from the specification shows up here rather than as an empty column after an
 * import. This is the check that caught the NauSYS mismatches.
 *
 * Writes nothing, to the vendor or to our database. Yacht and offer probes are
 * pinned to the test charter company so nothing touches live fleets.
 *
 *   pnpm --filter @yacht-charter/providers probe:booking-manager
 */
import { BookingManagerClient } from "../booking-manager/client";
import { resolveBookingManagerConfig } from "../booking-manager/config";
import { formatBookingManagerDateTime } from "../booking-manager/dates";
import {
  bookingManagerEndpoints as ep,
  restAvailabilityListSchema,
  restBaseListSchema,
  restCompanyListSchema,
  restCountryListSchema,
  restEquipmentListSchema,
  restOfferListSchema,
  restPriceListSchema,
  restSailingAreaListSchema,
  restShipyardListSchema,
  restWorldRegionListSchema,
  restYachtListSchema,
  restYachtTypeListSchema,
} from "../booking-manager/endpoints";
import type { QueryValue } from "../shared/http-client";

/** The vendor's demo fleet. Every scoped call pins this so no live fleet is read. */
const TEST_COMPANY_ID = 225;

const config = resolveBookingManagerConfig();

/** Kept so a schema failure can be shown against the payload that caused it. */
const lastRaw = new Map<string, unknown>();

const client = new BookingManagerClient({
  config,
  onRawResponse: (event) => {
    lastRaw.set(event.endpoint, event.body);
  },
});

type Probe = {
  name: string;
  endpoint: string;
  schema: Parameters<BookingManagerClient["get"]>[1];
  query?: Record<string, QueryValue | undefined>;
};

function nextSaturday(): string {
  const now = new Date();
  const utc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = ((6 - new Date(utc).getUTCDay() + 7) % 7) + 7;
  return new Date(utc + days * 86_400_000).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const checkIn = nextSaturday();
const checkOut = addDays(checkIn, 7);
const year = Number(checkIn.slice(0, 4));

const probes: Probe[] = [
  { name: "countries", endpoint: ep.countries, schema: restCountryListSchema },
  { name: "worldRegions", endpoint: ep.worldRegions, schema: restWorldRegionListSchema },
  { name: "sailingAreas", endpoint: ep.sailingAreas, schema: restSailingAreaListSchema },
  { name: "equipment", endpoint: ep.equipment, schema: restEquipmentListSchema },
  { name: "shipyards", endpoint: ep.shipyards, schema: restShipyardListSchema },
  { name: "yachtTypes", endpoint: ep.yachtTypes, schema: restYachtTypeListSchema },
  { name: "companies", endpoint: ep.companies, schema: restCompanyListSchema },
  { name: "bases", endpoint: ep.bases, schema: restBaseListSchema },
  {
    name: `yachts (company ${TEST_COMPANY_ID}, inventory=raw)`,
    endpoint: ep.yachts,
    schema: restYachtListSchema,
    query: { companyId: TEST_COMPANY_ID, inventory: "raw" },
  },
  {
    name: `availability ${year} (company ${TEST_COMPANY_ID})`,
    endpoint: ep.availability(year),
    schema: restAvailabilityListSchema,
    query: { companyId: TEST_COMPANY_ID },
  },
  {
    name: `offers ${checkIn} to ${checkOut} (company ${TEST_COMPANY_ID})`,
    endpoint: ep.offers,
    schema: restOfferListSchema,
    query: {
      dateFrom: formatBookingManagerDateTime(checkIn),
      dateTo: formatBookingManagerDateTime(checkOut),
      companyId: TEST_COMPANY_ID,
    },
  },
  {
    name: `prices ${checkIn} to ${checkOut} (company ${TEST_COMPANY_ID})`,
    endpoint: ep.prices,
    schema: restPriceListSchema,
    query: {
      dateFrom: formatBookingManagerDateTime(checkIn),
      dateTo: formatBookingManagerDateTime(checkOut),
      companyId: TEST_COMPANY_ID,
    },
  },
];

async function main(): Promise<void> {
  console.log(`host ${config.baseUrl}`);
  console.log(`test company ${TEST_COMPANY_ID}, sample week ${checkIn} to ${checkOut}\n`);

  let failures = 0;

  for (const probe of probes) {
    const started = Date.now();
    try {
      const rows = (await client.get(probe.endpoint, probe.schema, probe.query)) as unknown[];
      const ms = Date.now() - started;
      console.log(`PASS  ${probe.name}: ${rows.length} row(s) in ${ms}ms`);

      const [sample] = rows;
      if (sample && typeof sample === "object") {
        console.log(`      keys: ${Object.keys(sample).sort().join(", ")}`);
      }
    } catch (error) {
      failures += 1;
      const ms = Date.now() - started;
      console.log(`FAIL  ${probe.name} after ${ms}ms`);
      console.log(`      ${error instanceof Error ? error.message : String(error)}`);

      const payload = (error as { payload?: unknown }).payload;
      if (payload) console.log(`      ${JSON.stringify(payload).slice(0, 900)}`);

      const raw = lastRaw.get(probe.endpoint);
      if (Array.isArray(raw) && raw[0]) {
        console.log(`      vendor sent keys: ${Object.keys(raw[0] as object).sort().join(", ")}`);
        console.log(`      first row: ${JSON.stringify(raw[0]).slice(0, 900)}`);
      }
    }
  }

  console.log(`\n${probes.length - failures}/${probes.length} endpoints matched our schemas`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
