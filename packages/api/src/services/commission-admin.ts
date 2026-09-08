/*
 * The commission rates staff enter, and nothing else reads yet.
 *
 * Modelled on `discount-admin.ts` down to the derived status and the in-memory paging, because
 * it is the same shape of thing: a small, staff-sized table of rates with a validity window,
 * where status is a function of `active` plus the dates and would go stale the moment it was
 * stored.
 *
 * Deciding which rate applies to a charter lives in `commission.ts`, which is pure and tested.
 * This file only reads and writes rows.
 */
import { ORPCError } from "@orpc/server";
import { providerCommission } from "@yacht-charter/db/schema/commission";
import { operator } from "@yacht-charter/db/schema/operator";
import { provider } from "@yacht-charter/db/schema/provider";
import { and, asc, count, desc, eq, ilike, isNull, ne } from "drizzle-orm";
import type { z } from "zod";

import type { Database } from "../context";
import type {
  commissionCreateInputSchema,
  commissionListInputSchema,
  commissionListSchema,
  commissionSchema,
  commissionUpdateInputSchema,
  operatorOptionsInputSchema,
  operatorOptionsSchema,
  providerKeyOutputSchema,
} from "../contracts/admin";
import { writeAuditLog } from "./audit";
import { paginationFor } from "./pagination";

type ListInput = z.infer<typeof commissionListInputSchema>;
type ListResult = z.infer<typeof commissionListSchema>;
type Commission = z.infer<typeof commissionSchema>;
type CreateInput = z.infer<typeof commissionCreateInputSchema>;
type UpdateInput = z.infer<typeof commissionUpdateInputSchema>;
type ProviderKey = z.infer<typeof providerKeyOutputSchema>;

/** How many operators the picker offers at once. A search box, not a directory listing. */
const OPERATOR_OPTIONS_LIMIT = 20;

export async function listCommissions(db: Database, input: ListInput): Promise<ListResult> {
  const where = input.provider ? eq(provider.code, input.provider) : undefined;

  const [rows, [totals]] = await Promise.all([
    selectRows(db).where(where).orderBy(desc(providerCommission.createdAt)),
    db
      .select({ totalItems: count() })
      .from(providerCommission)
      .innerJoin(provider, eq(provider.id, providerCommission.providerId))
      .where(where),
  ]);

  const hydrated = rows.map(present);

  /* Status is derived from the window, so filtering it in SQL would mean writing the same
     date logic twice. The table is staff-sized -- one row per negotiated agreement -- so the
     honest trade is to filter and page in memory, exactly as the discount list does. */
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

export async function getCommission(db: Database, id: string): Promise<Commission> {
  const [row] = await selectRows(db).where(eq(providerCommission.id, id)).limit(1);
  if (!row) throw new ORPCError("NOT_FOUND", { message: "Unknown commission rate" });
  return present(row);
}

export async function createCommission(
  db: Database,
  actorUserId: string,
  input: CreateInput,
): Promise<Commission> {
  const providerId = await providerIdFor(db, input.provider);
  await warnOnOverlap(db, { ...input, providerId, id: null });

  const id = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(providerCommission)
      .values({
        providerId,
        operatorId: input.operatorId ?? null,
        ratePct: input.ratePct.toFixed(4),
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        createdBy: actorUserId,
      })
      .returning({ id: providerCommission.id });

    if (!created) throw new ORPCError("INTERNAL_SERVER_ERROR");

    await writeAuditLog(tx, {
      actorUserId,
      action: "create",
      entityType: "provider_commission",
      entityId: created.id,
      after: input,
    });

    return created.id;
  });

  return getCommission(db, id);
}

export async function updateCommission(
  db: Database,
  actorUserId: string,
  input: UpdateInput,
): Promise<Commission> {
  const before = await getCommission(db, input.id);
  const providerId = input.provider ? await providerIdFor(db, input.provider) : undefined;

  await db.transaction(async (tx) => {
    const patch: Partial<typeof providerCommission.$inferInsert> = {};
    if (providerId !== undefined) patch.providerId = providerId;
    if (input.operatorId !== undefined) patch.operatorId = input.operatorId;
    if (input.ratePct !== undefined) patch.ratePct = input.ratePct.toFixed(4);
    if (input.startsAt !== undefined) patch.startsAt = input.startsAt;
    if (input.endsAt !== undefined) patch.endsAt = input.endsAt;

    if (Object.keys(patch).length > 0) {
      await tx.update(providerCommission).set(patch).where(eq(providerCommission.id, input.id));
    }

    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "provider_commission",
      entityId: input.id,
      before,
      after: input,
    });
  });

  return getCommission(db, input.id);
}

export async function setCommissionActive(
  db: Database,
  actorUserId: string,
  id: string,
  active: boolean,
): Promise<Commission> {
  const before = await getCommission(db, id);

  await db.transaction(async (tx) => {
    await tx.update(providerCommission).set({ active }).where(eq(providerCommission.id, id));
    await writeAuditLog(tx, {
      actorUserId,
      action: "update",
      entityType: "provider_commission",
      entityId: id,
      before: { active: before.active },
      after: { active },
    });
  });

  return getCommission(db, id);
}

/** The operator picker's options: a search, since the table holds thousands. */
export async function listOperatorOptions(
  db: Database,
  input: z.infer<typeof operatorOptionsInputSchema>,
): Promise<z.infer<typeof operatorOptionsSchema>> {
  const rows = await db
    .select({ id: operator.id, name: operator.name })
    .from(operator)
    .where(input.query ? ilike(operator.name, `%${input.query}%`) : undefined)
    .orderBy(asc(operator.name))
    .limit(OPERATOR_OPTIONS_LIMIT);

  return { items: rows };
}

/* ------------------------------------------------------------------ helpers */

function selectRows(db: Database) {
  return db
    .select({
      id: providerCommission.id,
      providerCode: provider.code,
      providerName: provider.name,
      operatorId: providerCommission.operatorId,
      operatorName: operator.name,
      ratePct: providerCommission.ratePct,
      startsAt: providerCommission.startsAt,
      endsAt: providerCommission.endsAt,
      active: providerCommission.active,
      createdAt: providerCommission.createdAt,
    })
    .from(providerCommission)
    .innerJoin(provider, eq(provider.id, providerCommission.providerId))
    .leftJoin(operator, eq(operator.id, providerCommission.operatorId));
}

type Row = Awaited<ReturnType<ReturnType<typeof selectRows>["execute"]>>[number];

function present(row: Row): Commission {
  const today = new Date().toISOString().slice(0, 10);

  return {
    id: row.id,
    /*
     * Narrowed to the connectors this build ships. A rate against a retired connector cannot
     * be sold through and is not worth listing as though it could; the create form only offers
     * the three, so the case is a stale row rather than an ordinary one.
     */
    provider: asProviderKey(row.providerCode),
    providerName: row.providerName,
    operatorId: row.operatorId,
    operatorName: row.operatorName,
    ratePct: Number(row.ratePct),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    active: row.active,
    status: statusFor(row, today),
    createdAt: row.createdAt.toISOString(),
  };
}

const PROVIDER_KEYS: readonly ProviderKey[] = ["mock", "booking_manager", "nausys"];

function asProviderKey(code: string): ProviderKey {
  const key = PROVIDER_KEYS.find((candidate) => candidate === code);
  if (!key) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: `Unknown provider ${code}` });
  return key;
}

function statusFor(row: Row, today: string): Commission["status"] {
  if (!row.active) return "inactive";
  if (row.startsAt && row.startsAt > today) return "scheduled";
  if (row.endsAt && row.endsAt < today) return "expired";
  return "active";
}

async function providerIdFor(db: Database, code: ProviderKey): Promise<string> {
  const [row] = await db
    .select({ id: provider.id })
    .from(provider)
    .where(eq(provider.code, code))
    .limit(1);
  if (!row) throw new ORPCError("NOT_FOUND", { message: `Provider ${code} is not registered` });
  return row.id;
}

/**
 * Refuses a second rate covering the same vendor, operator and days.
 *
 * Not a database constraint: expressing it needs an exclusion constraint over a daterange, and
 * nothing else in this schema writes windows that way. Enforced here instead, where the message
 * can say which existing rate is in the way -- and `resolveCommissionRate` stays deterministic
 * for the rows that predate this check.
 */
async function warnOnOverlap(
  db: Database,
  input: {
    id: string | null;
    providerId: string;
    operatorId?: string | null;
    startsAt?: string | null;
    endsAt?: string | null;
  },
): Promise<void> {
  const scope = input.operatorId ?? null;

  const existing = await db
    .select({
      id: providerCommission.id,
      startsAt: providerCommission.startsAt,
      endsAt: providerCommission.endsAt,
    })
    .from(providerCommission)
    .where(
      and(
        eq(providerCommission.providerId, input.providerId),
        scope === null
          ? isNull(providerCommission.operatorId)
          : eq(providerCommission.operatorId, scope),
        eq(providerCommission.active, true),
        input.id ? ne(providerCommission.id, input.id) : undefined,
      ),
    );

  const clash = existing.find((row) => overlaps(row, input));
  if (clash) {
    throw new ORPCError("CONFLICT", {
      message: "An active rate already covers these dates for this provider and operator",
    });
  }
}

/* Both windows are inclusive and either end may be open, which is what the nulls mean. */
function overlaps(
  left: { startsAt: string | null; endsAt: string | null },
  right: { startsAt?: string | null; endsAt?: string | null },
): boolean {
  const leftEndsBefore =
    left.endsAt !== null && right.startsAt != null && left.endsAt < right.startsAt;
  const rightEndsBefore =
    right.endsAt != null && left.startsAt !== null && right.endsAt < left.startsAt;
  return !leftEndsBefore && !rightEndsBefore;
}
