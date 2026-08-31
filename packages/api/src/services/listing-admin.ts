import { ORPCError } from "@orpc/server";
import { base, location } from "@yacht-charter/db/schema/geography";
import { listing, listingSpecification } from "@yacht-charter/db/schema/listing";
import { listingFieldSource, listingOffer } from "@yacht-charter/db/schema/listing-offer";
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
  listingFieldSourcesInputSchema,
  listingFieldSourcesSchema,
  listingPublishDraftsInputSchema,
  listingPublishDraftsSchema,
  listingSetStatusInputSchema,
  listingSetStatusSchema,
  setListingFieldSourceInputSchema,
} from "../contracts/admin";
import {
  LISTING_FIELDS,
  resolveCanonicalListings,
} from "@yacht-charter/providers/sync/canonical-listing-writer";

import { writeAuditLog } from "./audit";
import { loadPrimaryImages } from "./match";
import { paginatedQuery, totalFrom } from "./pagination";

type FieldSources = z.infer<typeof listingFieldSourcesSchema>;
type FieldSourcesInput = z.infer<typeof listingFieldSourcesInputSchema>;
type SetFieldSourceInput = z.infer<typeof setListingFieldSourceInputSchema>;

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
 * The cheapest price staff can quote this listing from.
 *
 * The "cheapest available slot" the search read model publishes, read straight from
 * `availability_slot` because `listing_search_doc` only holds published listings and this
 * table exists to show the drafts — falling back to the cheapest published weekly period.
 *
 * The fallback is not decoration. A connector may send one without the other: Booking Manager
 * reports occupancy rather than free-with-price slots, so an availability-only read called
 * every one of its listings unpriced while their weekly rates sat in `listing_price_period`.
 */
const priceFromMinorColumn = sql<number | null>`coalesce(
  (
    select min(slot.price_minor)::int
    from availability_slot slot
    where slot.listing_id = ${listing.id} and slot.status = 'available'
  ),
  (
    select min(pp.price_minor)::int
    from listing_price_period pp
    where pp.listing_id = ${listing.id} and pp.kind = 'weekly'
  )
)`;

const currencyColumn = sql<string | null>`coalesce(
  (
    select min(slot.currency)
    from availability_slot slot
    where slot.listing_id = ${listing.id}
      and slot.status = 'available'
      and slot.price_minor is not null
  ),
  (
    select min(pp.currency)
    from listing_price_period pp
    where pp.listing_id = ${listing.id} and pp.kind = 'weekly'
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

/** Above one, the listing is merged and its field sources are worth a look. */
const offerCountColumn = sql<number>`(
  select count(*)::int from listing_offer o
  where o.listing_id = ${listing.id} and o.status = 'active'
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
          offerCount: offerCountColumn,
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
    offerCount: row.offerCount,
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

/* ------------------------------------------- per-field source overrides */

/** Accepts what a raw query returns as well as what the column mapper would have. */
function toIsoString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Which vendor each part of a merged listing is taken from, and who is available to take it
 * from instead.
 *
 * The resolver already picks — locked override, then the stated rule for media, then whichever
 * record says more, then the provider preference — and writes its choice back so it can be
 * read. This is that choice made visible and, where a person disagrees, overridable. It is
 * only interesting on a listing several vendors sell; on a single-offer listing every group
 * has exactly one candidate.
 */
export async function listListingFieldSources(
  db: Database,
  input: FieldSourcesInput,
): Promise<FieldSources> {
  const offers = await db.execute<{
    id: string;
    provider: string;
    status: "active" | "suppressed" | "retired";
    title: string | null;
    modelName: string | null;
    operatorName: string | null;
    baseName: string | null;
    yearBuilt: number | null;
    lengthM: string | null;
    cabins: number | null;
    berths: number | null;
    photoCount: number;
    descriptionCount: number;
  }>(sql`
    select
      o.id,
      p.code as provider,
      o.status::text as status,
      o.title,
      m.name as "modelName",
      op.name as "operatorName",
      b.name as "baseName",
      sp.year_built as "yearBuilt",
      sp.length_m as "lengthM",
      sp.cabins,
      sp.berths,
      (select count(*)::int from listing_media x where x.listing_offer_id = o.id) as "photoCount",
      (select count(*)::int from listing_text x where x.listing_offer_id = o.id) as "descriptionCount"
    from listing_offer o
    join provider p on p.id = o.provider_id
    left join listing_offer_specification sp on sp.listing_offer_id = o.id
    left join yacht_model m on m.id = o.model_id
    left join operator op on op.id = o.operator_id
    left join base b on b.id = o.home_base_id
    where o.listing_id = ${input.listingId}
    order by p.code
  `);

  if (offers.rows.length === 0) {
    throw new ORPCError("NOT_FOUND", { message: "This listing has no provider offers" });
  }

  const decisions = await db.execute<{
    field: FieldSources["decisions"][number]["field"];
    listingOfferId: string | null;
    locked: boolean;
    decidedBy: string | null;
    /*
     * A raw `db.execute` bypasses drizzle's column mapping, and its node-postgres driver hands
     * timestamps back as strings rather than Dates. Typed as both because the value has to be
     * normalised either way and a wrong guess here is a 500 the moment somebody pins a group.
     */
    decidedAt: string | Date | null;
  }>(sql`
    select field, listing_offer_id as "listingOfferId", locked,
           decided_by as "decidedBy", decided_at as "decidedAt"
    from listing_field_source
    where listing_id = ${input.listingId}
  `);

  const byField = new Map(decisions.rows.map((row) => [row.field, row]));

  return {
    listingId: input.listingId,
    offers: offers.rows.map((row) => ({
      ...row,
      lengthM: row.lengthM === null ? null : Number(row.lengthM),
    })),
    /* Every group, always, so a reviewer sees the ones nothing has decided yet. */
    decisions: LISTING_FIELDS.map((field) => {
      const decided = byField.get(field);
      return {
        field,
        listingOfferId: decided?.listingOfferId ?? null,
        locked: decided?.locked ?? false,
        decidedBy: decided?.decidedBy ?? null,
        decidedAt: toIsoString(decided?.decidedAt),
      };
    }),
  };
}

/**
 * Pins one field group to one vendor, or releases it back to the resolver.
 *
 * A locked row is the one thing the nightly resolver will not touch, so this is how a person
 * says "the photographs come from Booking Manager whatever the counts say". Releasing it is
 * passing `null`: the group goes back to being recomputed on every run, which is the right
 * answer once the reason for pinning it has gone.
 *
 * The listing is re-composed and its search document rebuilt straight away, because an
 * override nobody can see the effect of is indistinguishable from one that did not work.
 */
export async function setListingFieldSource(
  db: Database,
  actorUserId: string,
  input: SetFieldSourceInput,
): Promise<FieldSources> {
  const [previous] = await db
    .select({ listingOfferId: listingFieldSource.listingOfferId })
    .from(listingFieldSource)
    .where(
      and(
        eq(listingFieldSource.listingId, input.listingId),
        eq(listingFieldSource.field, input.field),
      ),
    )
    .limit(1);

  if (input.listingOfferId === null) {
    await db
      .update(listingFieldSource)
      .set({ locked: false, decidedBy: actorUserId, decidedAt: new Date() })
      .where(
        and(
          eq(listingFieldSource.listingId, input.listingId),
          eq(listingFieldSource.field, input.field),
        ),
      );
  } else {
    const [offer] = await db
      .select({ id: listingOffer.id })
      .from(listingOffer)
      .where(
        and(eq(listingOffer.id, input.listingOfferId), eq(listingOffer.listingId, input.listingId)),
      )
      .limit(1);

    if (!offer) {
      throw new ORPCError("BAD_REQUEST", {
        message: "That offer does not belong to this listing",
      });
    }

    await db
      .insert(listingFieldSource)
      .values({
        listingId: input.listingId,
        field: input.field,
        listingOfferId: input.listingOfferId,
        locked: true,
        decidedBy: actorUserId,
        decidedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [listingFieldSource.listingId, listingFieldSource.field],
        set: {
          listingOfferId: sql`excluded.listing_offer_id`,
          locked: sql`true`,
          decidedBy: sql`excluded.decided_by`,
          decidedAt: sql`excluded.decided_at`,
          updatedAt: sql`now()`,
        },
      });
  }

  await writeAuditLog(db, {
    actorUserId,
    action: "update",
    entityType: "listing",
    entityId: input.listingId,
    before: { field: input.field, listingOfferId: previous?.listingOfferId ?? null },
    after: {
      field: input.field,
      listingOfferId: input.listingOfferId,
      locked: input.listingOfferId !== null,
    },
  });

  await resolveCanonicalListings(db, [input.listingId]);
  await rebuildSearchReadModelsAfterSync(db, { listingIds: [input.listingId] });

  return listListingFieldSources(db, { listingId: input.listingId });
}
