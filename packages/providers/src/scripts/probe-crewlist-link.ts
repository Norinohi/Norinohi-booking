/**
 * Read-only probe: does a NauSYS reservation actually carry a crew-list link, and
 * what is the field called?
 *
 * `crewListLinkOf` matches the key case-insensitively because we have never seen it
 * on the wire — no recorded fixture carries it, and `crewlistlink` is only the name
 * NauSYS used when answering our question (Aug 2026). This script settles that
 * against the live account: it lists the agency's own reservations and prints every
 * key whose name mentions "crew", plus what our reader makes of the response.
 *
 * It only reads. Nothing here creates an info, an option or a booking.
 *
 *   pnpm --filter @yacht-charter/providers probe:crewlist \
 *     [-- --host https://ws-test.nausys.com --from 01.01.2025 --to 31.12.2027]
 */
import { z } from "zod";

import { NausysClient } from "../nausys/client";
import { resolveNausysConfig } from "../nausys/config";
import { crewListLinkOf, nausysEndpoints, restYachtReservationSchema } from "../nausys/endpoints";
import { looseJsonObject } from "../shared/json";
import { ProviderError } from "../shared/errors";

/** Loose on purpose: this runs to find out what the vendor sends, not to validate it. */
const probeResponseSchema = looseJsonObject({
  status: z.string(),
  errorCode: z.number().int().optional(),
  reservations: z.array(z.json()).optional(),
});

const CREW_KEY = /crew/i;

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * The vendor documents this endpoint's request only loosely, and the two auth
 * shapes are not interchangeable — catalogue calls put credentials at the top
 * level, `freeYachts` nests them. Rather than guess, try both and report which
 * one answered.
 */
async function fetchReservations(
  client: NausysClient,
  body: Record<string, string>,
): Promise<{ authStyle: string; response: z.infer<typeof probeResponseSchema> } | null> {
  const attempts = [
    {
      authStyle: "nested credentials",
      call: () => client.bookingCall(ENDPOINT, probeResponseSchema, body),
    },
    {
      authStyle: "top-level credentials",
      call: () => client.catalogueCall(ENDPOINT, probeResponseSchema, body),
    },
  ];

  for (const attempt of attempts) {
    try {
      return { authStyle: attempt.authStyle, response: await attempt.call() };
    } catch (error) {
      const detail =
        error instanceof ProviderError ? (error.providerCode ?? error.name) : String(error);
      console.log(`  ${attempt.authStyle}: refused (${detail})`);
    }
  }
  return null;
}

const ENDPOINT = nausysEndpoints.availability.reservations;

async function main(): Promise<void> {
  const configured = resolveNausysConfig();
  // Overridable so a probe can be aimed at the test host without editing `.env`,
  // which is the difference between poking at a sandbox and poking at the account
  // that holds real bookings.
  const config = { ...configured, baseUrl: arg("host", configured.baseUrl).replace(/\/+$/, "") };

  // "sync": a probe is background work and belongs on the serialized lane, not in
  // among live customer calls.
  const client = new NausysClient({ config }).forLane("sync");

  const periodFrom = arg("from", "01.01.2025");
  const periodTo = arg("to", "31.12.2027");

  console.log(`host ${config.baseUrl}  user ${config.username}`);
  console.log(`GET ${ENDPOINT}  ${periodFrom} → ${periodTo}\n`);

  const result = await fetchReservations(client, { periodFrom, periodTo });
  if (!result) {
    console.log("\nNeither auth shape was accepted, so this credential cannot list reservations.");
    console.log("That is itself the answer to Q-PERM for this endpoint — report it and stop.");
    return;
  }

  const { authStyle, response } = result;
  const reservations = response.reservations ?? [];
  console.log(`\naccepted with ${authStyle}; status ${response.status}`);
  console.log(`reservations returned: ${reservations.length}`);

  if (reservations.length === 0) {
    console.log("\nNothing to inspect: the account holds no reservation in this period.");
    console.log("Widen --from/--to, or the link can only be seen by making a test booking.");
    return;
  }

  const crewKeysSeen = new Set<string>();
  const statusesWithoutKey = new Set<string>();
  let withCrewKey = 0;
  let unparsable = 0;
  let linksFound = 0;

  for (const raw of reservations) {
    const parsed = z.record(z.string(), z.json()).safeParse(raw);
    if (!parsed.success) continue;

    const crewEntries = Object.entries(parsed.data).filter(([key]) => CREW_KEY.test(key));
    for (const [key] of crewEntries) crewKeysSeen.add(key);
    if (crewEntries.length > 0) withCrewKey += 1;
    else statusesWithoutKey.add(String(parsed.data.reservationStatus));

    // Through the real reader, so this reports what the connector would store
    // rather than what a human can spot in the payload.
    const reservation = restYachtReservationSchema.safeParse(raw);
    if (!reservation.success) unparsable += 1;
    const link = reservation.success ? crewListLinkOf(reservation.data) : undefined;
    if (link) linksFound += 1;

    if (crewEntries.length > 0 || link) {
      console.log(
        `\nreservation ${String(parsed.data.id)} (${String(parsed.data.reservationStatus)})`,
      );
      for (const [key, value] of crewEntries) console.log(`  ${key}: ${JSON.stringify(value)}`);
      console.log(`  crewListLinkOf → ${link ?? "(nothing)"}`);
    }
  }

  console.log(
    `\ncrew-ish keys seen: ${crewKeysSeen.size === 0 ? "(none)" : [...crewKeysSeen].join(", ")}`,
  );
  console.log(`reservations carrying one: ${withCrewKey}/${reservations.length}`);
  console.log(
    `reservations our reader would store a link for: ${linksFound}/${reservations.length}`,
  );
  // The two counts differ only if the reader rejected a link the vendor sent, or
  // if the reservation itself failed our own schema — both worth knowing about.
  console.log(`reservations our reservation schema rejected: ${unparsable}`);
  if (statusesWithoutKey.size > 0) {
    console.log(`statuses of reservations with no crew key: ${[...statusesWithoutKey].join(", ")}`);
  }

  if (crewKeysSeen.size === 0) {
    // Deliberately loud: a reservation list with no crew key at all means the link
    // is not on this payload, and the connector would never see one here.
    console.log("\nNo reservation carries a crew key. Either the link rides on a different");
    console.log("payload (createBooking's own response) or the field is named without 'crew'.");
    console.log("First reservation's keys, to check by eye:");
    console.log(
      `  ${Object.keys(z.record(z.string(), z.json()).parse(reservations[0])).join(", ")}`,
    );
  }
}

await main();
