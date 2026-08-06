import { ORPCError } from "@orpc/server";
import { wishlist, wishlistItem } from "@yacht-charter/db/schema/account";
import { listing } from "@yacht-charter/db/schema/listing";
import { listListingsByIds } from "@yacht-charter/db/search";
import { and, count, desc, eq } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  wishlistIdsSchema,
  wishlistListInputSchema,
  wishlistListSchema,
  wishlistToggleSchema,
} from "../contracts/wishlist";
import { presentListingSummary } from "../routers/presenters";

type Db = Database;
type ListInput = z.infer<typeof wishlistListInputSchema>;
type ListResult = z.infer<typeof wishlistListSchema>;
type ToggleResult = z.infer<typeof wishlistToggleSchema>;
type IdsResult = z.infer<typeof wishlistIdsSchema>;

export async function listWishlist(db: Db, userId: string, input: ListInput): Promise<ListResult> {
  const wishlistId = await findWishlistId(db, userId);
  if (!wishlistId) return { items: [], pagination: emptyPagination(input) };

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

export async function listWishlistIds(db: Db, userId: string): Promise<IdsResult> {
  const wishlistId = await findWishlistId(db, userId);
  if (!wishlistId) return { listingIds: [] };

  const rows = await db
    .select({ listingId: wishlistItem.listingId })
    .from(wishlistItem)
    .where(eq(wishlistItem.wishlistId, wishlistId));

  return { listingIds: rows.map((row) => row.listingId) };
}

export async function addWishlistItem(
  db: Db,
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

export async function removeWishlistItem(
  db: Db,
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

async function findWishlistId(db: Db, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: wishlist.id })
    .from(wishlist)
    .where(eq(wishlist.userId, userId))
    .limit(1);

  return row?.id ?? null;
}

/** The default "Saved yachts" list is created lazily, on the first save. */
async function getOrCreateWishlistId(db: Db, userId: string): Promise<string> {
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

// Mirrors paginationFor in packages/db/src/search/repository.ts so both pagers
// serialise identically for the shared Pagination component.
function paginationFor(input: {
  page: number;
  pageSize: number;
  totalItems: number;
  itemCount: number;
}) {
  const totalPages = Math.max(Math.ceil(input.totalItems / input.pageSize), 1);
  const startItem = input.itemCount > 0 ? (input.page - 1) * input.pageSize + 1 : 0;
  const endItem = input.itemCount > 0 ? startItem + input.itemCount - 1 : 0;

  return {
    page: input.page,
    pageSize: input.pageSize,
    totalItems: input.totalItems,
    totalPages,
    startItem,
    endItem,
    hasPreviousPage: input.page > 1,
    hasNextPage: input.page < totalPages,
  };
}
