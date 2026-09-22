import { listingSource } from "@yacht-charter/db/schema/listing-source";
import {
  provider as providerTable,
  providerRawPayload,
  providerRecord,
} from "@yacht-charter/db/schema/provider";
import { and, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

import type { Database } from "../registry";
const discountCapSchema = z.coerce.number().finite();

/**
 * The operator's bound on our client discount for this listing's yacht, off the stored catalogue:
 * the yacht's own `maxDiscountFromCommissionPercentage`, else its company's. Every yacht on the
 * account states one today and agrees with its company, so the fallback covers a yacht payload
 * that stops carrying it rather than any known case.
 */
export async function loadBookingManagerDiscountCap(
  db: Database,
  listingId: string,
): Promise<number | undefined> {
  const yachtPayload = alias(providerRawPayload, "yacht_payload");
  const companyRecord = alias(providerRecord, "company_record");
  const companyPayload = alias(providerRawPayload, "company_payload");
  const [row] = await db
    .select({
      percentage: sql<string | null>`coalesce(
        ${yachtPayload.payload}->>'maxDiscountFromCommissionPercentage',
        ${companyPayload.payload}->>'maxDiscountFromCommissionPercentage'
      )`,
    })
    .from(listingSource)
    .innerJoin(providerRecord, eq(providerRecord.id, listingSource.providerRecordId))
    .innerJoin(providerTable, eq(providerTable.id, providerRecord.providerId))
    .innerJoin(yachtPayload, eq(yachtPayload.id, providerRecord.rawPayloadId))
    .leftJoin(
      companyRecord,
      and(
        eq(companyRecord.providerId, providerRecord.providerId),
        eq(companyRecord.resourceType, "company"),
        eq(companyRecord.externalId, sql`${yachtPayload.payload}->>'companyId'`),
      ),
    )
    .leftJoin(companyPayload, eq(companyPayload.id, companyRecord.rawPayloadId))
    .where(and(eq(listingSource.listingId, listingId), eq(providerTable.code, "booking_manager")))
    .limit(1);

  if (row?.percentage == null) return undefined;
  return discountCapSchema.safeParse(row.percentage).data;
}
