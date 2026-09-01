/**
 * Read-only probe: does `crewlist/v6/get` answer on this credential, and what does the
 * operator require?
 *
 * The backend map recorded the crew-list API as undiscoverable — "every plausible spelling
 * under /CBMS-external/rest/crewlist/v6/ answers HTTP 404". The spelling was never the
 * problem: the endpoint takes the reservation id and its rotating security token as path
 * segments, and a call without them has no reservation to answer about. This settles that
 * against the live account by reading the token out of each reservation's own `crewlistlink`
 * and asking for the list behind it.
 *
 * It only reads. `crewlist/v6/set2` files a manifest with a real charter company, and nothing
 * here calls it -- `--show-body` prints the request it would send instead, which is as close
 * as this account gets to a round trip: the credential sees 504 companies and not one of them
 * is a vendor test company, and `ws-test.nausys.com` refuses it.
 *
 *   pnpm --filter @yacht-charter/providers probe:crew-list \
 *     [-- --host https://ws-test.nausys.com --from 01.01.2025 --to 31.12.2027 --limit 5]
 *     [-- --show-body]
 */
import { z } from "zod";

import { NausysClient } from "../nausys/client";
import { resolveNausysConfig } from "../nausys/config";
import {
  crewListPath,
  crewListSetPath,
  fetchNausysCrewRequirements,
  nausysCrewListBody,
} from "../nausys/crew-list";
import { crewListLinkOf, nausysEndpoints, restYachtReservationSchema } from "../nausys/endpoints";
import { ProviderError } from "../shared/errors";
import { looseJsonObject } from "../shared/json";
import type { CrewListMember } from "../types";

const probeResponseSchema = looseJsonObject({
  status: z.string(),
  errorCode: z.number().int().optional(),
  reservations: z.array(z.json()).optional(),
});

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

/**
 * `https://crew.nausys.com/<reservationId>/<token>/` is the whole authorisation for the crew
 * list, which is why the API path repeats those two segments.
 */
function tokenFromLink(link: string): { reservationId: string; securityCode: string } | null {
  const match = /\/(\d+)\/([0-9a-zA-Z-]+)\/?$/.exec(link);
  if (!match?.[1] || !match[2] || match[2] === "null") return null;
  return { reservationId: match[1], securityCode: match[2] };
}

/** One person, carrying every field an operator asked for in the live pass. */
const SAMPLE: CrewListMember = {
  firstName: "Ana",
  lastName: "Marić",
  skipper: true,
  dateOfBirth: "1986-04-12",
  birthPlace: "Split",
  birthCountry: "HR",
  nationality: "HR",
  documentType: "PASSPORT",
  documentNumber: "SAMPLE-NOT-SENT",
  gender: "FEMALE",
  livingPlace: "Zagreb",
  livingCountry: "HR",
  skipperLicence: "RYA-102938",
  skipperEmail: "skipper@example.com",
};

async function main(): Promise<void> {
  const configured = resolveNausysConfig();
  const config = { ...configured, baseUrl: arg("host", configured.baseUrl).replace(/\/+$/, "") };
  const client = new NausysClient({ config }).forLane("sync");

  const periodFrom = arg("from", "01.01.2025");
  const periodTo = arg("to", "31.12.2027");
  const limit = Number(arg("limit", "5"));

  console.log(`host ${config.baseUrl}  user ${config.username}`);
  console.log(`GET ${nausysEndpoints.availability.reservations}  ${periodFrom} → ${periodTo}\n`);

  const response = await client.bookingCall(
    nausysEndpoints.availability.reservations,
    probeResponseSchema,
    { periodFrom, periodTo },
  );

  const reservations = response.reservations ?? [];
  console.log(`reservations returned: ${reservations.length}`);

  let asked = 0;
  for (const raw of reservations) {
    if (asked >= limit) break;

    const parsed = restYachtReservationSchema.safeParse(raw);
    if (!parsed.success) continue;

    const link = crewListLinkOf(parsed.data);
    const ref = link ? tokenFromLink(link) : null;
    if (!ref) continue;

    asked += 1;
    console.log(`\nreservation ${ref.reservationId}`);
    console.log(`  GET ${crewListPath(ref.reservationId, ref.securityCode)}`);

    try {
      const requirements = await fetchNausysCrewRequirements(
        client,
        ref.reservationId,
        ref.securityCode,
      );
      console.log(`  maxPassengers: ${requirements.maxPassengers ?? "(none)"}`);
      console.log(`  insertSkipper: ${requirements.skipperRequired ?? "(none)"}`);
      console.log(
        `  requiredFields: ${requirements.requiredFields.length === 0 ? "(none)" : requirements.requiredFields.join(", ")}`,
      );
    } catch (error) {
      const detail =
        error instanceof ProviderError ? (error.providerCode ?? error.name) : String(error);
      console.log(`  refused (${detail})`);
    }
  }

  if (process.argv.includes("--show-body")) {
    const body = await nausysCrewListBody(client, [SAMPLE], "Landing at 23:40");
    console.log(
      `\n\nwhat a POST ${crewListSetPath("<reservationId>", "<securityCode>")} would carry:`,
    );
    console.log(JSON.stringify(body, null, 2));
    console.log("\n(not sent: every reservation on this account belongs to a real operator)");
  }

  if (asked === 0) {
    console.log("\nNo reservation carried a usable crew-list token in this period.");
    console.log("Widen --from/--to, or the account holds only reservations without one.");
  }
}

await main();
