import { providerExtraCatalogue } from "@yacht-charter/db/schema/listing-source";
import { isGenericLineLabel } from "@yacht-charter/providers/shared/generic-labels";
import type { ProviderQuote } from "@yacht-charter/providers/types";
import { and, eq, inArray } from "drizzle-orm";

import type { Database } from "../context";

type QuoteLine = ProviderQuote["lines"][number];

/**
 * An obligatory extra a real charter was billed, written back where the catalogue has no row.
 *
 * The catalogue is projected from the vendor's yacht record, and that is not a complete list
 * of what an offer charges. Booking Manager billed a 400 EUR damage waiver on a hull whose
 * products publish a 350 EUR one, and NauSYS bills services no season of the yacht lists at
 * all. Either way the yacht page understated a mandatory fee, and only the quote knew better.
 *
 * Three things are deliberately narrow.
 *
 * Only `mandatory` lines. An optional extra nobody has to pay is not a figure the page is
 * wrong to omit, and a customer's own selection is not a fact about the boat.
 *
 * Only lines the vendor named. A label that is one of our placeholders says nothing about what
 * was charged, and writing "Charter extra" into the catalogue would turn a gap into a claim.
 *
 * Only codes the offer has no row for. A published row states a list price with the seasons,
 * bases and durations it applies to; a quote knows one charter. Where the vendor has published
 * something, it stays.
 *
 * Best-effort by construction: the customer has a price, and losing the note about how we got
 * it must not lose the quote.
 */
export async function learnExtrasFromQuote(
  db: Database,
  input: {
    listingId: string;
    listingOfferId: string;
    provider: string;
    lines: readonly QuoteLine[];
  },
): Promise<number> {
  const billed = input.lines.filter(
    (line) =>
      line.group === "mandatory" &&
      (line.kind === "extra" || line.kind === "fee") &&
      !isGenericLineLabel(line.label),
  );
  if (billed.length === 0) return 0;

  const billable = billed.flatMap((line) => {
    const code = parseExtraCode(line.code);
    return code === null ? [] : [{ ...code, line }];
  });
  if (billable.length === 0) return 0;

  const known = await db
    .select({ externalId: providerExtraCatalogue.externalId })
    .from(providerExtraCatalogue)
    .where(
      and(
        eq(providerExtraCatalogue.listingOfferId, input.listingOfferId),
        inArray(
          providerExtraCatalogue.externalId,
          billable.map((entry) => entry.externalId),
        ),
      ),
    );
  const published = new Set(known.map((row) => row.externalId));

  const rows = billable
    .filter((entry) => !published.has(entry.externalId))
    .map((entry) => ({
      listingId: input.listingId,
      listingOfferId: input.listingOfferId,
      source: input.provider,
      kind: entry.kind,
      externalId: entry.externalId,
      name: entry.line.label,
      obligatory: true,
      priceMinor: entry.line.amount.amountMinor,
      priceCurrency: entry.line.amount.currency,
      onRequestOnly: false,
      learnedAt: new Date(),
    }));
  if (rows.length === 0) return 0;

  /*
   * `do nothing` rather than an update: two quotes racing on the same charter both see no row
   * and both try to write one, and either is equally true. A later sync replaces whatever
   * lands here with whatever the vendor publishes by then.
   */
  await db
    .insert(providerExtraCatalogue)
    .values(rows)
    .onConflictDoNothing({
      target: [
        providerExtraCatalogue.listingOfferId,
        providerExtraCatalogue.kind,
        providerExtraCatalogue.externalId,
      ],
    });

  return rows.length;
}

/**
 * `<kind>:<externalId>`, the canonical code both adapters mint. Parsed rather than split blind:
 * our own line codes ("base-charter", "bm-discount") share the space and carry no colon, and a
 * kind the catalogue column cannot hold must not reach the insert.
 */
function parseExtraCode(
  code: string,
): { kind: "service" | "equipment"; externalId: string } | null {
  const [kind, externalId] = code.split(":", 2);
  if (externalId === undefined || externalId.length === 0) return null;
  if (kind !== "service" && kind !== "equipment") return null;
  return { kind, externalId };
}
