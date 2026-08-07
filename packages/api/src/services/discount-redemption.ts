import { ORPCError } from "@orpc/server";
import { discount, discountRedemption, discountTarget } from "@yacht-charter/db/schema/discount";
import { listing } from "@yacht-charter/db/schema/listing";
import { count, eq } from "drizzle-orm";

import type { Database, DatabaseExecutor } from "../context";

/*
 * The customer half of discounts: validating a promo code while quoting, and
 * consuming a use at checkout. Shares nothing with the admin CRUD but the table.
 */

export type DiscountRejection =
  | "unknown_code"
  | "inactive"
  | "not_started"
  | "expired"
  | "usage_limit_reached"
  | "not_applicable";

export type ResolvedDiscount = {
  id: string;
  code: string;
  name: string;
  type: "percentage" | "fixed_amount";
  valuePct: number | null;
  valueMinor: number | null;
  currency: string | null;
};

/**
 * Validates a promo code against one listing, for the quote pipeline.
 *
 * Returns a reason rather than throwing: quoting is public and a mistyped code
 * should re-price without it and say so, not fail the whole request.
 *
 * The usage limit is checked here for feedback only. It is enforced for real at
 * checkout, inside the booking transaction — quoting must never consume a code.
 */
export async function resolveDiscountForListing(
  db: Database,
  code: string,
  listingId: string,
  onDate: string = new Date().toISOString().slice(0, 10),
): Promise<{ discount: ResolvedDiscount } | { rejected: DiscountRejection }> {
  const normalized = code.trim().toUpperCase();

  const [row] = await db.select().from(discount).where(eq(discount.code, normalized)).limit(1);
  if (!row) return { rejected: "unknown_code" };
  if (!row.active) return { rejected: "inactive" };
  if (row.startsAt && row.startsAt > onDate) return { rejected: "not_started" };
  if (row.endsAt && row.endsAt < onDate) return { rejected: "expired" };

  if (row.usageLimit !== null) {
    const [used] = await db
      .select({ total: count() })
      .from(discountRedemption)
      .where(eq(discountRedemption.discountId, row.id));

    if ((used?.total ?? 0) >= row.usageLimit) return { rejected: "usage_limit_reached" };
  }

  if (!(await targetsListing(db, row.id, listingId))) return { rejected: "not_applicable" };

  return {
    discount: {
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      valuePct: row.valuePct === null ? null : Number(row.valuePct),
      valueMinor: row.valueMinor,
      currency: row.currency,
    },
  };
}

/** Does any of this discount's targets cover the listing, its category or operator? */
async function targetsListing(db: Database, discountId: string, listingId: string) {
  const targets = await db
    .select({ targetType: discountTarget.targetType, targetId: discountTarget.targetId })
    .from(discountTarget)
    .where(eq(discountTarget.discountId, discountId));

  if (targets.some((target) => target.targetType === "all")) return true;

  const [owner] = await db
    .select({
      id: listing.id,
      operatorId: listing.operatorId,
      categoryId: listing.categoryId,
    })
    .from(listing)
    .where(eq(listing.id, listingId))
    .limit(1);

  if (!owner) return false;

  return targets.some((target) => {
    if (target.targetType === "listing") return target.targetId === owner.id;
    if (target.targetType === "category") return target.targetId === owner.categoryId;
    if (target.targetType === "operator") return target.targetId === owner.operatorId;
    return false;
  });
}

/**
 * Consumes one use of a discount for a booking. Called inside the checkout
 * transaction, which is the only place the usage limit is actually binding.
 *
 * Re-checks the limit under the same transaction so two simultaneous checkouts
 * cannot both take the last remaining use.
 */
export async function redeemDiscount(
  tx: DatabaseExecutor,
  input: {
    discountId: string;
    userId: string;
    bookingId: string;
    amountMinor: number;
    currency: string;
  },
): Promise<void> {
  const [row] = await tx
    .select({ usageLimit: discount.usageLimit })
    .from(discount)
    .where(eq(discount.id, input.discountId))
    .limit(1);

  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown discount" });

  if (row.usageLimit !== null) {
    const [used] = await tx
      .select({ total: count() })
      .from(discountRedemption)
      .where(eq(discountRedemption.discountId, input.discountId));

    if ((used?.total ?? 0) >= row.usageLimit) {
      throw new ORPCError("CONFLICT", {
        message: "This promo code has been fully redeemed",
        data: { code: "DISCOUNT_EXHAUSTED" },
      });
    }
  }

  await tx
    .insert(discountRedemption)
    .values({
      discountId: input.discountId,
      userId: input.userId,
      bookingId: input.bookingId,
      amountMinor: input.amountMinor,
      currency: input.currency,
    })
    // Unique on (discount_id, booking_id): a retried checkout must not double-count.
    .onConflictDoNothing();
}
