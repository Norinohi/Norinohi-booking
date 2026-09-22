import {
  provider as providerTable,
  providerRawPayload,
  providerRecord,
} from "@yacht-charter/db/schema/provider";
import { and, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "../registry";
import { chunked } from "../shared/chunks";
import type { JsonValue } from "../shared/json";
import { idOf, positiveInt, text } from "../shared/projection-helpers";
import { restYachtSchema, type RestYacht } from "./endpoints";
import { maxNightsOf, soldProductOf } from "./projection";

/**
 * What a yacht's own record says about which `/prices` rows describe a charter it sells.
 *
 * `/prices` answers for every product and every base pair the price list covers, and neither
 * is what `/offers` sells: without `productName` it offers the default product alone, and on
 * company 225 it sold only home-to-home round trips while `/prices` listed one-way pairs
 * beside them (SS 123 25 <-> 31, Tri Luke nine pairs, all refused by `/offers`). The maximum
 * matters the same way: a day boat has a weekly `/prices` figure and no charter `/offers` sells
 * that the weekly list could estimate. The minimum is read only to check the maximum against it.
 */
export interface BookingManagerPriceTerms {
  /** The product `/offers` prices when it is not given one. */
  product?: string;
  homeBaseId?: string;
  maxNights?: number;
}

export function priceTermsOf(
  yacht: Pick<
    RestYacht,
    "products" | "homeBaseId" | "minimumCharterDuration" | "maximumCharterDuration"
  >,
): BookingManagerPriceTerms {
  const terms: BookingManagerPriceTerms = {};
  const product = text(soldProductOf(yacht)?.name);
  if (product) terms.product = product;
  const homeBaseId = idOf(yacht.homeBaseId);
  if (homeBaseId !== null) terms.homeBaseId = homeBaseId;
  const maxNights = maxNightsOf(yacht, positiveInt(yacht.minimumCharterDuration));
  if (maxNights !== undefined) terms.maxNights = maxNights;
  return terms;
}

const priceTermsRowSchema = restYachtSchema.pick({
  products: true,
  homeBaseId: true,
  minimumCharterDuration: true,
  maximumCharterDuration: true,
});

/**
 * The terms of every stored yacht asked about, by the vendor's yacht id.
 *
 * Only the four fields are read out of the payload, and the products without their extras: a
 * fleet-wide sweep asks about eleven thousand yachts, and the whole records run to hundreds of
 * megabytes. `homeBaseId` comes back as text because node-postgres parses jsonb with
 * `JSON.parse`, which rounds a 19-digit id.
 */
export async function loadBookingManagerPriceTerms(
  db: Database,
  externalYachtIds: readonly string[],
): Promise<Map<string, BookingManagerPriceTerms>> {
  const found = new Map<string, BookingManagerPriceTerms>();
  if (externalYachtIds.length === 0) return found;

  for (const chunk of chunked([...new Set(externalYachtIds)])) {
    const rows = await db
      .select({
        externalId: providerRecord.externalId,
        homeBaseId: sql<string | null>`${providerRawPayload.payload}->>'homeBaseId'`,
        minimumCharterDuration: sql<JsonValue>`${providerRawPayload.payload}->'minimumCharterDuration'`,
        maximumCharterDuration: sql<JsonValue>`${providerRawPayload.payload}->'maximumCharterDuration'`,
        products: sql<JsonValue>`(
          select coalesce(jsonb_agg(jsonb_build_object(
            'name', product->'name',
            'isDefaultProduct', product->'isDefaultProduct'
          )), '[]'::jsonb)
          from jsonb_array_elements(
            case when jsonb_typeof(${providerRawPayload.payload}->'products') = 'array'
              then ${providerRawPayload.payload}->'products' else '[]'::jsonb end
          ) product
        )`,
      })
      .from(providerRecord)
      .innerJoin(providerTable, eq(providerTable.id, providerRecord.providerId))
      .innerJoin(providerRawPayload, eq(providerRawPayload.id, providerRecord.rawPayloadId))
      .where(
        and(
          eq(providerTable.code, "booking_manager"),
          eq(providerRecord.resourceType, "yacht"),
          eq(providerRecord.active, true),
          inArray(providerRecord.externalId, chunk),
        ),
      );

    for (const { externalId, ...fields } of rows) {
      // A record this cannot read keeps no terms, which the price selection reads as "unknown"
      // rather than as a yacht that sells nothing.
      const parsed = priceTermsRowSchema.safeParse(fields);
      if (parsed.success) found.set(externalId, priceTermsOf(parsed.data));
    }
  }

  return found;
}

/** The product the listing sells for one stored yacht, where its record names any. */
export async function loadBookingManagerProductName(
  db: Database,
  externalYachtId: string,
): Promise<string | undefined> {
  return (await loadBookingManagerPriceTerms(db, [externalYachtId])).get(externalYachtId)?.product;
}
