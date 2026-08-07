import { ORPCError } from "@orpc/server";
import { wishlist, wishlistItem } from "@yacht-charter/db/schema/account";
import { listing } from "@yacht-charter/db/schema/listing";
import { listListingsByIds } from "@yacht-charter/db/search";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  wishlistIdsSchema,
  wishlistListInputSchema,
  wishlistListSchema,
  wishlistMergeSchema,
  wishlistToggleSchema,
} from "../contracts/wishlist";
import { presentListingSummary } from "../presenters/listing";
import { paginationFor } from "./pagination";
type ListInput = z.infer<typeof wishlistListInputSchema>;

type ListResult = z.infer<typeof wishlistListSchema>;
type ToggleResult = z.infer<typeof wishlistToggleSchema>;
type IdsResult = z.infer<typeof wishlistIdsSchema>;
type MergeResult = z.infer<typeof wishlistMergeSchema>;

export async function listWishlist(
  db: Database,
  userId: string,
  input: ListInput,
): Promise<ListResult> {
  const wishlistId = await findWishlistId(db, userId);
  if (!wishlistId) return { items: [], pagination: emptyPagination(input) };

  // Not paginatedQuery: itemCount here is the hydrated docs, not the saved rows.
  // An unpublished listing occupies a slot on its page but does not render, so
  // the two counts genuinely differ and the helper's rows.length would be wrong.
  const offset = (input.page - 1) * input.pageSize;

  const [rows, [totals]] = await Promise.all([
    db
      .select({ listingId: wishlistItem.listingId, savedAt: wishlistItem.createdAt })
      .from(wishlistItem)
      .where(eq(wishlistItem.wishlistId, wishlistId))
      .orderBy(desc(wishlistItem.createdAt), desc(wishlistItem.id))
      .limit(input.pageSize)
      .offset(offset),
    db
      .select({ totalItems: count() })
      .from(wishlistItem)
      .where(eq(wishlistItem.wishlistId, wishlistId)),
  ]);

  const savedAtById = new Map(rows.map((row) => [row.listingId, row.savedAt.toISOString()]));
  const docs = await listListingsByIds(
    db,
    rows.map((row) => row.listingId),
  );

  const items = docs.map((doc) => ({
    listing: presentListingSummary(doc),
    savedAt: savedAtById.get(doc.listingId) ?? new Date(0).toISOString(),
  }));

  return {
    items,
    pagination: paginationFor({
      page: input.page,
      pageSize: input.pageSize,
      // Count the saved rows, not the hydrated ones: an unpublished listing still
      // occupies a slot on its page, so the pager must not shift under it.
      totalItems: totals?.totalItems ?? 0,
      itemCount: items.length,
    }),
  };
}

export async function listWishlistIds(db: Database, userId: string): Promise<IdsResult> {
  const wishlistId = await findWishlistId(db, userId);
  if (!wishlistId) return { listingIds: [] };

  const rows = await db
    .select({ listingId: wishlistItem.listingId })
    .from(wishlistItem)
    .where(eq(wishlistItem.wishlistId, wishlistId));

  return { listingIds: rows.map((row) => row.listingId) };
}

export async function addWishlistItem(
  db: Database,
  userId: string,
  listingId: string,
): Promise<ToggleResult> {
  const [exists] = await db
    .select({ id: listing.id })
    .from(listing)
    .where(eq(listing.id, listingId))
    .limit(1);

  if (!exists) throw new ORPCError("NOT_FOUND", { message: "Unknown listing" });

  const wishlistId = await getOrCreateWishlistId(db, userId);

  const [inserted] = await db
    .insert(wishlistItem)
    .values({ wishlistId, listingId })
    .onConflictDoNothing()
    .returning({ savedAt: wishlistItem.createdAt });

  if (inserted) return { listingId, saved: true, savedAt: inserted.savedAt.toISOString() };

  // Already saved — report the original timestamp rather than pretending it is new.
  const [existing] = await db
    .select({ savedAt: wishlistItem.createdAt })
    .from(wishlistItem)
    .where(and(eq(wishlistItem.wishlistId, wishlistId), eq(wishlistItem.listingId, listingId)))
    .limit(1);

  return { listingId, saved: true, savedAt: existing?.savedAt.toISOString() ?? null };
}

/**
 * Folds a guest's browser-held wishlist into the account at sign-in.
 *
 * Unknown ids are skipped rather than rejected: the local list can be weeks old,
 * and one delisted yacht must not cost the user the rest of their saves.
 */
export async function mergeWishlist(
  db: Database,
  userId: string,
  listingIds: string[],
): Promise<MergeResult> {
  const requested = [...new Set(listingIds)];
  if (requested.length === 0) {
    const { listingIds: current } = await listWishlistIds(db, userId);
    return { listingIds: current, added: 0, skipped: 0 };
  }

  const known = await db
    .select({ id: listing.id })
    .from(listing)
    .where(inArray(listing.id, requested));

  if (known.length === 0) {
    const { listingIds: current } = await listWishlistIds(db, userId);
    return { listingIds: current, added: 0, skipped: requested.length };
  }

  const wishlistId = await getOrCreateWishlistId(db, userId);

  // onConflictDoNothing keeps the merge idempotent against the (wishlist_id,
  // listing_id) unique index, and preserves the original savedAt on re-runs.
  const inserted = await db
    .insert(wishlistItem)
    .values(known.map((row) => ({ wishlistId, listingId: row.id })))
    .onConflictDoNothing()
    .returning({ listingId: wishlistItem.listingId });

  const { listingIds: current } = await listWishlistIds(db, userId);

  return {
    listingIds: current,
    added: inserted.length,
    skipped: requested.length - inserted.length,
  };
}

export async function removeWishlistItem(
  db: Database,
  userId: string,
  listingId: string,
): Promise<ToggleResult> {
  const wishlistId = await findWishlistId(db, userId);
  if (wishlistId) {
    await db
      .delete(wishlistItem)
      .where(and(eq(wishlistItem.wishlistId, wishlistId), eq(wishlistItem.listingId, listingId)));
  }

  return { listingId, saved: false, savedAt: null };
}

async function findWishlistId(db: Database, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: wishlist.id })
    .from(wishlist)
    .where(eq(wishlist.userId, userId))
    .limit(1);

  return row?.id ?? null;
}

/** The default "Saved yachts" list is created lazily, on the first save. */
async function getOrCreateWishlistId(db: Database, userId: string): Promise<string> {
  const existing = await findWishlistId(db, userId);
  if (existing) return existing;

  const [created] = await db.insert(wishlist).values({ userId }).returning({ id: wishlist.id });
  if (created) return created.id;

  const raced = await findWishlistId(db, userId);
  if (raced) return raced;

  throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not create a wishlist" });
}

function emptyPagination(input: ListInput) {
  return paginationFor({
    page: input.page,
    pageSize: input.pageSize,
    totalItems: 0,
    itemCount: 0,
  });
}
