import { ORPCError } from "@orpc/server";
import { discount, discountRedemption, discountTarget } from "@yacht-charter/db/schema/discount";
import { listing } from "@yacht-charter/db/schema/listing";
import { operator } from "@yacht-charter/db/schema/operator";
import { region } from "@yacht-charter/db/schema/geography";
import { listingSearchDoc } from "@yacht-charter/db/schema/search";
import { yachtCategory } from "@yacht-charter/db/schema/taxonomy";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import type { z } from "zod";

import type { Database, DatabaseExecutor } from "../context";
import type {
  discountCreateInputSchema,
  discountListInputSchema,
  discountListSchema,
  discountSchema,
  discountUpdateInputSchema,
  yachtOptionsInputSchema,
  yachtOptionsSchema,
} from "../contracts/admin";
import { writeAuditLog } from "./audit";
import { paginationFor } from "./pagination";

type ListInput = z.infer<typeof discountListInputSchema>;
type ListResult = z.infer<typeof discountListSchema>;
type Discount = z.infer<typeof discountSchema>;
type CreateInput = z.infer<typeof discountCreateInputSchema>;
type UpdateInput = z.infer<typeof discountUpdateInputSchema>;
type YachtOptionsInput = z.infer<typeof yachtOptionsInputSchema>;
type YachtOptions = z.infer<typeof yachtOptionsSchema>;

type DiscountRow = typeof discount.$inferSelect;
type TargetRow = typeof discountTarget.$inferSelect;

export async function listDiscounts(db: Database, input: ListInput): Promise<ListResult> {
  const filters = [];
  if (input.query) {
    const pattern = `%${input.query}%`;
    filters.push(or(ilike(discount.name, pattern), ilike(discount.code, pattern)));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, [totals]] = await Promise.all([
    db.select().from(discount).where(where).orderBy(desc(discount.createdAt), desc(discount.id)),
    db.select({ totalItems: count() }).from(discount).where(where),
  ]);

  const hydrated = await hydrate(db, rows);

  // Status is derived, so it cannot be filtered in SQL without duplicating the
  // date logic there. The discount table is staff-sized (hundreds, not millions),
  // so filtering and paging in memory is the honest trade.
  const matching = input.status
    ? hydrated.filter((item) => item.status === input.status)
    : hydrated;
  const offset = (input.page - 1) * input.pageSize;
  const items = matching.slice(offset, offset + input.pageSize);

  return {
    items,
    pagination: paginationFor({
      page: input.page,
      pageSize: input.pageSize,
      totalItems: input.status ? matching.length : (totals?.totalItems ?? 0),
      itemCount: items.length,
    }),
  };
}

export async function getDiscount(db: Database, id: string): Promise<Discount> {
  const [row] = await db.select().from(discount).where(eq(discount.id, id)).limit(1);
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown discount" });

  const [hydrated] = await hydrate(db, [row]);
  if (!hydrated) throw new ORPCError("NOT_FOUND", { message: "Unknown discount" });
  return hydrated;
}

export async function createDiscount(
  db: Database,
  actorUserId: string,
  input: CreateInput,
): Promise<Discount> {
  await assertCodeIsFree(db, input.code, null);
  await assertTargetsExist(db, input.targets);

  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(discount)
      .values({
        name: input.name,
        code: input.code,
        type: input.type,
        valuePct: input.valuePct === undefined ? null : toNumeric(input.valuePct),
        valueMinor: input.valueMinor ?? null,
        currency: input.currency ?? null,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        usageLimit: input.usageLimit ?? null,
        createdBy: actorUserId,
      })
      .returning({ id: discount.id });

    if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

    await tx.insert(discountTarget).values(
      input.targets.map((target) => ({
        discountId: created.id,
        targetType: target.targetType,
        targetId: target.targetType === "all" ? null : (target.targetId ?? null),
      })),
    );

    await writeAuditLog(tx, {
      actorUserId,
      action: "create",
      entityType: "discount",
      entityId: created.id,
      after: input,
    });

    return created.id;
  });

  return getDiscount(db, id);
}

export async function updateDiscount(
  db: Database,
  actorUserId: string,
  input: UpdateInput,
): Promise<Discount> {
  const before = await getDiscount(db, input.id);

  if (input.code) await assertCodeIsFree(db, input.code, input.id);
  if (input.targets) await assertTargetsExist(db, input.targets);

  await db.transaction(async (tx) => {
    const patch: Partial<typeof discount.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.code !== undefined) patch.code = input.code;
    if (input.type !== undefined) patch.type = input.type;
    if (input.valuePct !== undefined) patch.valuePct = toNumeric(input.valuePct);
    if (input.valueMinor !== undefined) patch.valueMinor = input.valueMinor;
    if (input.currency !== undefined) patch.currency = input.currency;
    if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
    if (input.endsAt !== undefined) patch.endsAt = input.endsAt;
    if (input.usageLimit !== undefined) patch.usageLimit = input.usageLimit;

    if (Object.keys(patch).length > 0) {
      await tx.update(discount).set(patch).where(eq(discount.id, input.id));
    }

    // Targets are replaced wholesale: the modal always submits the full checkbox
    // state, so diffing rows would only reconstruct what the client already sent.
    if (input.targets) {
      await tx.delete(discountTarget).where(eq(discountTarget.discountId, input.id));
      await tx.insert(discountTarget).values(
        input.targets.map((target) => ({
          discountId: input.id,
          targetType: target.targetType,
          targetId: target.targetType === "all" ? null : (target.targetId ?? null),
        })),
      );
    }

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "discount",
      entityId: input.id,
      before,
      after: input,
    });
  });

  return getDiscount(db, input.id);
}

export async function setDiscountActive(
  db: Database,
  actorUserId: string,
  id: string,
  active: boolean,
): Promise<Discount> {
  const before = await getDiscount(db, id);

  await db.transaction(async (tx) => {
    await tx.update(discount).set({ active }).where(eq(discount.id, id));
    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "discount",
      entityId: id,
      before: { active: before.active },
      after: { active },
    });
  });

  return getDiscount(db, id);
}

export async function listYachtOptions(
  db: Database,
  input: YachtOptionsInput,
): Promise<YachtOptions> {
  const filters = [];
  if (input.query) filters.push(ilike(listingSearchDoc.title, `%${input.query}%`));
  if (input.categoryCode) {
    const [category] = await db
      .select({ name: yachtCategory.name })
      .from(yachtCategory)
      .where(eq(yachtCategory.code, input.categoryCode))
      .limit(1);
    // An unknown code must return nothing, not silently drop the filter and
    // offer the whole catalogue.
    if (!category) return { items: [] };

    // The search doc denormalizes the category by name, not by id.
    filters.push(eq(listingSearchDoc.category, category.name));
  }

  const rows = await db
    .select({
      id: listingSearchDoc.listingId,
      title: listingSearchDoc.title,
      categoryName: listingSearchDoc.category,
      baseName: listingSearchDoc.baseName,
    })
    .from(listingSearchDoc)
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(listingSearchDoc.title))
    .limit(input.limit);

  return { items: rows };
}

/* ------------------------------------------------------------------ helpers */

async function hydrate(db: Database, rows: DiscountRow[]): Promise<Discount[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);

  const [targets, usage] = await Promise.all([
    db.select().from(discountTarget).where(inArray(discountTarget.discountId, ids)),
    db
      .select({ discountId: discountRedemption.discountId, used: count() })
      .from(discountRedemption)
      .where(inArray(discountRedemption.discountId, ids))
      .groupBy(discountRedemption.discountId),
  ]);

  const labels = await resolveTargetLabels(db, targets);
  const usageByDiscount = new Map(usage.map((row) => [row.discountId, row.used]));
  const targetsByDiscount = new Map<string, TargetRow[]>();
  for (const target of targets) {
    const list = targetsByDiscount.get(target.discountId) ?? [];
    list.push(target);
    targetsByDiscount.set(target.discountId, list);
  }

  const today = new Date().toISOString().slice(0, 10);

  return rows.map((row) => {
    const rowTargets = (targetsByDiscount.get(row.id) ?? []).map((target) => ({
      targetType: target.targetType,
      targetId: target.targetId,
      targetLabel: target.targetId ? (labels.get(target.targetId) ?? null) : null,
    }));

    return {
      id: row.id,
      name: row.name,
      code: row.code,
      type: row.type,
      valuePct: row.valuePct === null ? null : Number(row.valuePct),
      value:
        row.valueMinor === null
          ? null
          : { amountMinor: row.valueMinor, currency: row.currency ?? "EUR" },
      targets: rowTargets,
      appliesToLabel: appliesToLabel(rowTargets),
      status: statusFor(row, today),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      usageLimit: row.usageLimit,
      usageCount: usageByDiscount.get(row.id) ?? 0,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

function statusFor(row: DiscountRow, today: string): Discount["status"] {
  if (!row.active) return "inactive";
  if (row.startsAt && row.startsAt > today) return "scheduled";
  if (row.endsAt && row.endsAt < today) return "expired";
  return "active";
}

function appliesToLabel(targets: Discount["targets"]): string {
  if (targets.length === 0) return "Nothing";
  if (targets.some((target) => target.targetType === "all")) return "All yachts";

  const named = targets.map((target) => target.targetLabel ?? target.targetId ?? "Unknown");
  // The table cell is narrow; beyond two names it reads better as a count.
  if (named.length <= 2) return named.join(", ");
  return `${named[0]} +${named.length - 1} more`;
}

/** One lookup per target type, so the "Applies to" cell never N+1s. */
async function resolveTargetLabels(
  db: Database,
  targets: TargetRow[],
): Promise<Map<string, string>> {
  const byType = {
    listing: idsOfType(targets, "listing"),
    category: idsOfType(targets, "category"),
    operator: idsOfType(targets, "operator"),
    region: idsOfType(targets, "region"),
  };

  const [listings, categories, operators, regions] = await Promise.all([
    byType.listing.length > 0
      ? db
          .select({ id: listing.id, label: listing.title })
          .from(listing)
          .where(inArray(listing.id, byType.listing))
      : [],
    byType.category.length > 0
      ? db
          .select({ id: yachtCategory.id, label: yachtCategory.name })
          .from(yachtCategory)
          .where(inArray(yachtCategory.id, byType.category))
      : [],
    byType.operator.length > 0
      ? db
          .select({ id: operator.id, label: operator.name })
          .from(operator)
          .where(inArray(operator.id, byType.operator))
      : [],
    byType.region.length > 0
      ? db
          .select({ id: region.id, label: region.name })
          .from(region)
          .where(inArray(region.id, byType.region))
      : [],
  ]);

  return new Map(
    [...listings, ...categories, ...operators, ...regions].map((row) => [row.id, row.label]),
  );
}

function idsOfType(targets: TargetRow[], type: TargetRow["targetType"]): string[] {
  return targets
    .filter((target) => target.targetType === type && target.targetId !== null)
    .map((target) => target.targetId as string);
}

async function assertCodeIsFree(db: Database, code: string, exceptId: string | null) {
  const [clash] = await db
    .select({ id: discount.id })
    .from(discount)
    .where(eq(discount.code, code))
    .limit(1);

  if (clash && clash.id !== exceptId) {
    throw new ORPCError("CONFLICT", { message: `Discount code ${code} is already in use` });
  }
}

/** A dangling target would silently widen or narrow what the discount applies to. */
async function assertTargetsExist(
  db: Database,
  targets: readonly { targetType: string; targetId?: string | null }[],
) {
  const checks: Promise<void>[] = [];

  for (const target of targets) {
    if (target.targetType === "all" || !target.targetId) continue;
    const targetId = target.targetId;

    const exists = async (table: typeof listing | typeof yachtCategory, label: string) => {
      const [row] = await db
        .select({ id: table.id })
        .from(table)
        .where(eq(table.id, targetId))
        .limit(1);
      if (!row) throw new ORPCError("NOT_FOUND", { message: `Unknown ${label} ${targetId}` });
    };

    if (target.targetType === "listing") checks.push(exists(listing, "listing"));
    if (target.targetType === "category") checks.push(exists(yachtCategory, "category"));
  }

  await Promise.all(checks);
}

function toNumeric(value: number | null | undefined): string | null {
  return value === null || value === undefined ? null : value.toFixed(4);
}

/* ------------------------------------------------- customer-facing redemption */

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
