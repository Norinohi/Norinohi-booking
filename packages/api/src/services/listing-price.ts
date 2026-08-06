import { ORPCError } from "@orpc/server";
import { priceAdjustmentRule, priceAdjustmentTarget } from "@yacht-charter/db/schema/admin";
import { listingSearchDoc } from "@yacht-charter/db/schema/search";
import { and, asc, count, eq, ilike, inArray, isNotNull } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  listingPriceFiltersSchema,
  listingPriceListInputSchema,
  listingPriceListSchema,
  listingPriceRowSchema,
  listingPriceUpdateInputSchema,
} from "../contracts/admin";
import { writeAuditLog } from "./audit";
import { paginationFor } from "./pagination";
import { loadAdjustmentsForListings, resolveAdjustedPrice } from "./pricing";

type ListInput = z.infer<typeof listingPriceListInputSchema>;
type ListResult = z.infer<typeof listingPriceListSchema>;
type Row = z.infer<typeof listingPriceRowSchema>;
type Filters = z.infer<typeof listingPriceFiltersSchema>;
type UpdateInput = z.infer<typeof listingPriceUpdateInputSchema>;

const RULE_NAME_PREFIX = "Manual price override";

export async function listListingPrices(db: Database, input: ListInput): Promise<ListResult> {
  const filters = [];
  if (input.query) filters.push(ilike(listingSearchDoc.title, `%${input.query}%`));
  if (input.category) filters.push(eq(listingSearchDoc.category, input.category));
  if (input.location) filters.push(eq(listingSearchDoc.location, input.location));
  const where = filters.length > 0 ? and(...filters) : undefined;

  const offset = (input.page - 1) * input.pageSize;

  const [docs, [totals]] = await Promise.all([
    db
      .select({
        listingId: listingSearchDoc.listingId,
        title: listingSearchDoc.title,
        baseName: listingSearchDoc.baseName,
        location: listingSearchDoc.location,
        country: listingSearchDoc.country,
        priceFromMinor: listingSearchDoc.priceFromMinor,
        currency: listingSearchDoc.currency,
      })
      .from(listingSearchDoc)
      .where(where)
      .orderBy(asc(listingSearchDoc.title), asc(listingSearchDoc.listingId))
      .limit(input.pageSize)
      .offset(offset),
    db.select({ totalItems: count() }).from(listingSearchDoc).where(where),
  ]);

  const adjustments = await loadAdjustmentsForListings(
    db,
    docs.map((doc) => doc.listingId),
  );

  const items: Row[] = docs.map((doc) => {
    const currency = doc.currency ?? "EUR";
    const basePrice =
      doc.priceFromMinor === null ? null : { amountMinor: doc.priceFromMinor, currency };

    if (!basePrice) {
      return {
        listingId: doc.listingId,
        title: doc.title,
        baseName: doc.baseName,
        locationName: doc.location,
        countryName: doc.country,
        basePrice: null,
        currentPrice: null,
        activeRuleId: null,
        activeRuleLabel: null,
      };
    }

    const resolved = resolveAdjustedPrice(
      basePrice.amountMinor,
      adjustments.get(doc.listingId) ?? [],
    );

    return {
      listingId: doc.listingId,
      title: doc.title,
      baseName: doc.baseName,
      locationName: doc.location,
      countryName: doc.country,
      basePrice,
      currentPrice: { amountMinor: resolved.amountMinor, currency },
      activeRuleId: resolved.appliedRuleId,
      activeRuleLabel: resolved.appliedRuleLabel,
    };
  });

  return {
    items,
    pagination: paginationFor({
      page: input.page,
      pageSize: input.pageSize,
      totalItems: totals?.totalItems ?? 0,
      itemCount: items.length,
    }),
  };
}

/** Drives the "All types" and "All locations" dropdowns above the table. */
export async function listListingPriceFilters(db: Database): Promise<Filters> {
  const [categories, locations] = await Promise.all([
    db
      .selectDistinct({ value: listingSearchDoc.category })
      .from(listingSearchDoc)
      .where(isNotNull(listingSearchDoc.category))
      .orderBy(asc(listingSearchDoc.category)),
    db
      .selectDistinct({ value: listingSearchDoc.location })
      .from(listingSearchDoc)
      .orderBy(asc(listingSearchDoc.location)),
  ]);

  return {
    categories: categories
      .filter((row): row is { value: string } => row.value !== null)
      .map((row) => ({ value: row.value, label: row.value })),
    locations: locations.map((row) => ({ value: row.value, label: row.value })),
  };
}

/**
 * Replaces the manual override for one listing. Any previous manual override is
 * deactivated rather than deleted, so audit_log entries keep pointing at a rule
 * that still exists.
 */
export async function updateListingPrice(
  db: Database,
  actorUserId: string,
  input: UpdateInput,
): Promise<Row> {
  const [doc] = await db
    .select({
      listingId: listingSearchDoc.listingId,
      title: listingSearchDoc.title,
      priceFromMinor: listingSearchDoc.priceFromMinor,
      currency: listingSearchDoc.currency,
    })
    .from(listingSearchDoc)
    .where(eq(listingSearchDoc.listingId, input.listingId))
    .limit(1);

  if (!doc) throw new ORPCError("NOT_FOUND", { message: "Unknown listing" });

  const previous = await loadAdjustmentsForListings(db, [input.listingId]);

  await db.transaction(async (tx) => {
    const staleIds = (previous.get(input.listingId) ?? [])
      .filter((rule) => rule.name.startsWith(RULE_NAME_PREFIX))
      .map((rule) => rule.id);

    if (staleIds.length > 0) {
      await tx
        .update(priceAdjustmentRule)
        .set({ active: false })
        .where(inArray(priceAdjustmentRule.id, staleIds));
    }

    const [rule] = await tx
      .insert(priceAdjustmentRule)
      .values({
        name: `${RULE_NAME_PREFIX} — ${doc.title}`,
        type: "fixed_amount",
        valueMinor: input.newPriceMinor,
        currency: input.currency,
        // Above the default 0 used by bulk rules, and non-stackable, so a manual
        // override is exactly what the listing shows.
        priority: 100,
        stackable: false,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        createdBy: actorUserId,
      })
      .returning({ id: priceAdjustmentRule.id });

    if (!rule) throw new ORPCError("INTERNAL_SERVER_ERROR");

    await tx.insert(priceAdjustmentTarget).values({
      ruleId: rule.id,
      targetType: "listing",
      targetId: input.listingId,
    });

    await writeAuditLog(tx, {
      actorUserId,
      action: "price_adjustment",
      entityType: "listing",
      entityId: input.listingId,
      before: { basePriceMinor: doc.priceFromMinor, deactivatedRuleIds: staleIds },
      after: {
        ruleId: rule.id,
        newPriceMinor: input.newPriceMinor,
        currency: input.currency,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
      },
      metadata: input.note ? { note: input.note } : undefined,
    });
  });

  return readRow(db, input.listingId);
}

/** Drops the manual override, returning the listing to its provider price. */
export async function clearListingPrice(
  db: Database,
  actorUserId: string,
  listingId: string,
): Promise<Row> {
  const previous = await loadAdjustmentsForListings(db, [listingId]);
  const staleIds = (previous.get(listingId) ?? [])
    .filter((rule) => rule.name.startsWith(RULE_NAME_PREFIX))
    .map((rule) => rule.id);

  if (staleIds.length === 0) return readRow(db, listingId);

  await db.transaction(async (tx) => {
    await tx
      .update(priceAdjustmentRule)
      .set({ active: false })
      .where(inArray(priceAdjustmentRule.id, staleIds));

    await writeAuditLog(tx, {
      actorUserId,
      action: "price_adjustment",
      entityType: "listing",
      entityId: listingId,
      before: { activeRuleIds: staleIds },
      after: { activeRuleIds: [] },
    });
  });

  return readRow(db, listingId);
}

async function readRow(db: Database, listingId: string): Promise<Row> {
  const row = await listOne(db, listingId);
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown listing" });
  return row;
}

async function listOne(db: Database, listingId: string): Promise<Row | null> {
  const [doc] = await db
    .select({
      listingId: listingSearchDoc.listingId,
      title: listingSearchDoc.title,
      baseName: listingSearchDoc.baseName,
      location: listingSearchDoc.location,
      country: listingSearchDoc.country,
      priceFromMinor: listingSearchDoc.priceFromMinor,
      currency: listingSearchDoc.currency,
    })
    .from(listingSearchDoc)
    .where(eq(listingSearchDoc.listingId, listingId))
    .limit(1);

  if (!doc) return null;

  const currency = doc.currency ?? "EUR";
  if (doc.priceFromMinor === null) {
    return {
      listingId: doc.listingId,
      title: doc.title,
      baseName: doc.baseName,
      locationName: doc.location,
      countryName: doc.country,
      basePrice: null,
      currentPrice: null,
      activeRuleId: null,
      activeRuleLabel: null,
    };
  }

  const adjustments = await loadAdjustmentsForListings(db, [listingId]);
  const resolved = resolveAdjustedPrice(doc.priceFromMinor, adjustments.get(listingId) ?? []);

  return {
    listingId: doc.listingId,
    title: doc.title,
    baseName: doc.baseName,
    locationName: doc.location,
    countryName: doc.country,
    basePrice: { amountMinor: doc.priceFromMinor, currency },
    currentPrice: { amountMinor: resolved.amountMinor, currency },
    activeRuleId: resolved.appliedRuleId,
    activeRuleLabel: resolved.appliedRuleLabel,
  };
}
