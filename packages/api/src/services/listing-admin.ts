import { ORPCError } from "@orpc/server";
import { base, location } from "@yacht-charter/db/schema/geography";
import { listing, listingSpecification } from "@yacht-charter/db/schema/listing";
import { operator } from "@yacht-charter/db/schema/operator";
import { yachtModel } from "@yacht-charter/db/schema/taxonomy";
import {
  publishDraftListings,
  rebuildSearchReadModelsAfterSync,
} from "@yacht-charter/db/search/read-model";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  listingAdminListInputSchema,
  listingAdminListSchema,
  listingAdminRowSchema,
  listingPublishDraftsInputSchema,
  listingPublishDraftsSchema,
  listingSetStatusInputSchema,
  listingSetStatusSchema,
} from "../contracts/admin";
import { writeAuditLog } from "./audit";
import { loadPrimaryImages } from "./match";
import { paginatedQuery, totalFrom } from "./pagination";

type ListInput = z.infer<typeof listingAdminListInputSchema>;
type ListResult = z.infer<typeof listingAdminListSchema>;
type Row = z.infer<typeof listingAdminRowSchema>;
type SetStatusInput = z.infer<typeof listingSetStatusInputSchema>;
type SetStatusResult = z.infer<typeof listingSetStatusSchema>;
type PublishDraftsInput = z.infer<typeof listingPublishDraftsInputSchema>;
type PublishDraftsResult = z.infer<typeof listingPublishDraftsSchema>;

/**
 * A listing may carry several sources once a merge has run, so this is a
 * correlated scalar rather than a join: joining `listing_source` would multiply
 * the page and break both the count and the pager.
 */
const providerCodeColumn = sql<string | null>`(
  select p.code
  from listing_source ls
  join provider_record pr on pr.id = ls.provider_record_id
  join provider p on p.id = pr.provider_id
  where ls.listing_id = ${listing.id}
  order by p.code
  limit 1
)`;

/**
 * The same "cheapest available slot" the search read model publishes, read
 * straight from `availability_slot` because `listing_search_doc` only holds
 * published listings and this table exists to show the drafts.
 */
const priceFromMinorColumn = sql<number | null>`(
  select min(slot.price_minor)::int
  from availability_slot slot
  where slot.listing_id = ${listing.id} and slot.status = 'available'
)`;

const currencyColumn = sql<string | null>`coalesce(
  (
    select min(slot.currency)
    from availability_slot slot
    where slot.listing_id = ${listing.id}
      and slot.status = 'available'
      and slot.price_minor is not null
  ),
  ${listing.defaultCurrency}
)`;

/**
 * Free dates, no published weekly rate. Correlated rather than joined, for the same
 * reason `providerCodeColumn` is: either table can hold many rows per listing.
 */
const unpricedWithDates = sql`(
  exists (select 1 from listing_free_period f where f.listing_id = ${listing.id})
  and not exists (
    select 1 from listing_price_period pp
    where pp.listing_id = ${listing.id} and pp.kind = 'weekly'
  )
)`;

function providerScope(providerCode: string) {
  return sql`exists (
    select 1
    from listing_source ls
    join provider_record pr on pr.id = ls.provider_record_id
    join provider p on p.id = pr.provider_id
    where ls.listing_id = ${listing.id} and p.code = ${providerCode}
  )`;
}

/**
 * The whole catalogue as staff see it, drafts included. Every join is a leftJoin:
 * a row missing its base or its operator is exactly the row someone came here to
 * find, and dropping it would make the problem invisible.
 */
export async function listAdminListings(db: Database, input: ListInput): Promise<ListResult> {
  const filters = [];
  if (input.provider) filters.push(providerScope(input.provider));
  if (input.status) filters.push(eq(listing.status, input.status));
  if (input.query) {
    const pattern = `%${input.query}%`;
    filters.push(or(ilike(listing.title, pattern), ilike(listing.slug, pattern)));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const { rows, pagination } = await paginatedQuery({
    page: input.page,
    pageSize: input.pageSize,
    rows: (limit, offset) =>
      db
        .select({
          id: listing.id,
          title: listing.title,
          slug: listing.slug,
          status: listing.status,
          createdAt: listing.createdAt,
          operatorName: operator.name,
          modelName: yachtModel.name,
          yearBuilt: listingSpecification.yearBuilt,
          baseName: base.name,
          locationName: location.name,
          provider: providerCodeColumn,
          priceFromMinor: priceFromMinorColumn,
          currency: currencyColumn,
        })
        .from(listing)
        .leftJoin(operator, eq(operator.id, listing.operatorId))
        .leftJoin(yachtModel, eq(yachtModel.id, listing.modelId))
        .leftJoin(listingSpecification, eq(listingSpecification.listingId, listing.id))
        .leftJoin(base, eq(base.id, listing.homeBaseId))
        .leftJoin(location, eq(location.id, base.locationId))
        .where(where)
        .orderBy(desc(listing.createdAt), desc(listing.id))
        .limit(limit)
        .offset(offset),
    total: async () =>
      totalFrom(await db.select({ totalItems: count() }).from(listing).where(where)),
  });

  // Counted over the filter rather than the page: a per-page number would say more
  // about the pager than about the catalogue.
  const [unpriced] = await db
    .select({ total: count() })
    .from(listing)
    .where(where ? and(where, unpricedWithDates) : unpricedWithDates);

  const images = await loadPrimaryImages(
    db,
    rows.map((row) => row.id),
  );

  const items: Row[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    provider: row.provider,
    operatorName: row.operatorName,
    modelName: row.modelName,
    yearBuilt: row.yearBuilt,
    baseName: row.baseName,
    locationName: row.locationName,
    primaryImageUrl: images.get(row.id) ?? null,
    priceFromMinor: row.priceFromMinor,
    currency: row.currency,
    createdAt: row.createdAt.toISOString(),
  }));

  return {
    items,
    pagination,
    summary: { unpricedWithDates: unpriced?.total ?? 0 },
  };
}

/** Publishing, hiding and sending a listing back to draft, one listing at a time. */
export async function setListingStatus(
  db: Database,
  actorUserId: string,
  input: SetStatusInput,
): Promise<SetStatusResult> {
  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: listing.id, status: listing.status })
      .from(listing)
      .where(eq(listing.id, input.id))
      .limit(1)
      .for("update");

    if (!current) throw new ORPCError("NOT_FOUND", { message: "Unknown listing" });

    await tx.update(listing).set({ status: input.status }).where(eq(listing.id, input.id));

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "listing",
      entityId: input.id,
      before: { status: current.status },
      after: { status: input.status },
    });

    return { id: current.id, status: input.status };
  });

  // After the commit, so the rebuild reads the new status: it writes the search
  // doc when the listing is now published and deletes it when it is not.
  await rebuildSearchReadModelsAfterSync(db, { listingIds: [result.id] });

  return result;
}

/**
 * Releases a provider's imported drafts in bulk.
 *
 * Without `provider` this publishes every provider's drafts at once, which is why
 * the scope is spelled out in the audit entry: `providerScope: "all"` is the
 * record that an unreviewed catalogue-wide release happened and who did it.
 */
export async function publishListingDrafts(
  db: Database,
  actorUserId: string,
  input: PublishDraftsInput,
): Promise<PublishDraftsResult> {
  // publishDraftListings owns the update and the search rebuild together; running
  // it inside a transaction here would let the two drift apart.
  const { publishedCount } = await publishDraftListings(db, { providerCode: input.provider });

  await writeAuditLog(db, {
    actorUserId,
    action: "update",
    entityType: "listing",
    entityId: null,
    before: { status: "draft" },
    after: {
      status: "published",
      providerScope: input.provider ?? "all",
      publishedCount,
    },
  });

  return { publishedCount };
}
