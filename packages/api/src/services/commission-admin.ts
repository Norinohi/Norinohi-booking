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
import { isProviderKey } from "@yacht-charter/env/providers";
import { providerCommission } from "@yacht-charter/db/schema/commission";
import { listingOffer } from "@yacht-charter/db/schema/listing-offer";
import { operator } from "@yacht-charter/db/schema/operator";
import { provider } from "@yacht-charter/db/schema/provider";
import { and, asc, count, desc, eq, ilike, isNull, max, min, ne, sql } from "drizzle-orm";
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
  reportedCommissionListInputSchema,
  reportedCommissionListSchema,
  providerKeyOutputSchema,
} from "../contracts/admin";
import { writeAuditLog } from "./audit";
import { paginationFor } from "./pagination";
import { BadRequestError, ConflictError, InternalError, NotFoundError } from "../errors";

type ListInput = z.infer<typeof commissionListInputSchema>;
type ListResult = z.infer<typeof commissionListSchema>;
type Commission = z.infer<typeof commissionSchema>;
type CreateInput = z.infer<typeof commissionCreateInputSchema>;
type UpdateInput = z.infer<typeof commissionUpdateInputSchema>;
type ProviderKey = z.infer<typeof providerKeyOutputSchema>;
type ReportedListInput = z.infer<typeof reportedCommissionListInputSchema>;
type ReportedListResult = z.infer<typeof reportedCommissionListSchema>;

/** How many operators the picker offers at once. A search box, not a directory listing. */
const OPERATOR_OPTIONS_LIMIT = 20;

/* The left joins leave one null row for an operator with no offers, which the filter drops. */
const operatorProviderCodes = sql<string[]>`coalesce(
  array_agg(distinct ${provider.code}) filter (where ${provider.code} is not null),
  '{}'
)`;

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
  if (!row) throw new NotFoundError({ message: "Unknown commission rate" });
  return present(row);
}

export async function createCommission(
  db: Database,
  actorUserId: string,
  input: CreateInput,
): Promise<Commission> {
  const providerId = await providerIdFor(db, input.provider);
  await assertOperatorSoldBy(db, providerId, input.operatorId ?? null);
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

    if (!created) throw new InternalError();

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

  if (input.provider !== undefined || input.operatorId !== undefined) {
    await assertOperatorSoldBy(
      db,
      providerId ?? (await providerIdFor(db, before.provider)),
      input.operatorId === undefined ? before.operatorId : input.operatorId,
    );
  }

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

/**
 * The operator picker's options: a search, since the table holds thousands.
 *
 * An operator row carries no vendor. Each sync writes its own row per company, so the same
 * charter company appears once per vendor under the same name, and the only link back to the
 * vendor is the offers it sells through. An operator with no offers is left out when a vendor is
 * asked for: no charter could ever match a rate against it.
 */
export async function listOperatorOptions(
  db: Database,
  input: z.infer<typeof operatorOptionsInputSchema>,
): Promise<z.infer<typeof operatorOptionsSchema>> {
  const rows = await db
    .select({
      id: operator.id,
      name: operator.name,
      providers: operatorProviderCodes,
    })
    .from(operator)
    .leftJoin(listingOffer, eq(listingOffer.operatorId, operator.id))
    .leftJoin(provider, eq(provider.id, listingOffer.providerId))
    .where(
      and(
        input.query ? ilike(operator.name, `%${input.query}%`) : undefined,
        input.provider ? eq(provider.code, input.provider) : undefined,
      ),
    )
    .groupBy(operator.id)
    .orderBy(asc(operator.name), asc(operator.id))
    .limit(OPERATOR_OPTIONS_LIMIT);

  return {
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      providers: row.providers.filter(isProviderKey),
    })),
  };
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

function asProviderKey(code: string): ProviderKey {
  if (!isProviderKey(code)) {
    throw new InternalError({ message: `Unknown provider ${code}` });
  }
  return code;
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
  if (!row) throw new NotFoundError({ message: `Provider ${code} is not registered` });
  return row.id;
}

/**
 * Refuses an operator-scoped rate the vendor could never apply: `resolveCommissionRate` matches
 * on the offer's own vendor and operator, so a rate pairing a NauSYS vendor with a Booking
 * Manager company is saved and then silently never used.
 */
async function assertOperatorSoldBy(
  db: Database,
  providerId: string,
  operatorId: string | null,
): Promise<void> {
  if (operatorId === null) return;

  const [offer] = await db
    .select({ id: listingOffer.id })
    .from(listingOffer)
    .where(and(eq(listingOffer.providerId, providerId), eq(listingOffer.operatorId, operatorId)))
    .limit(1);

  if (!offer) {
    throw new BadRequestError({
      message: "This operator has no yachts with the chosen provider",
      data: { code: "OPERATOR_NOT_SOLD_BY_PROVIDER" },
    });
  }
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
    throw new ConflictError({
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

/**
 * What the vendors themselves report, per operator.
 *
 * The rates above are a negotiation somebody typed in; this is a reading of `listing_offer`,
 * which the availability sweep stamps with whatever commission the vendor quoted on the last
 * week it priced. Both are shown because they answer different questions -- what we agreed,
 * and what is actually arriving -- and a gap between them is the reason this exists.
 *
 * Grouped in SQL rather than in memory, unlike the hand-typed list: that table is staff-sized
 * and this one spans the whole catalogue.
 */
export async function listReportedCommissions(
  db: Database,
  input: ReportedListInput,
): Promise<ReportedListResult> {
  const filters = [eq(listingOffer.status, "active")];
  if (input.provider) filters.push(eq(provider.code, input.provider));
  if (input.query) filters.push(ilike(operator.name, `%${input.query}%`));
  const scope = and(...filters);
  const rated = and(scope, sql`${listingOffer.commissionPct} is not null`);

  /*
   * `mode()` rather than an average: a rate is a term, not a measurement, and an operator that
   * charges 15 on most boats and 20 on two catamarans has two rates rather than a mean of
   * 15.4 that appears in no agreement.
   */
  const grouped = db
    .select({
      providerCode: provider.code,
      providerName: provider.name,
      operatorId: listingOffer.operatorId,
      operatorName: operator.name,
      offerCount: count(),
      minPct: min(listingOffer.commissionPct),
      maxPct: max(listingOffer.commissionPct),
      commonPct: sql<string>`mode() within group (order by ${listingOffer.commissionPct})`,
      /* Drizzle's own aggregate, not raw SQL: `max()` over a timestamp comes back from the
         driver as a string, and a hand-written one drops the column's date mapping with it. */
      lastSeenAt: max(listingOffer.commissionSeenAt),
    })
    .from(listingOffer)
    .innerJoin(provider, eq(provider.id, listingOffer.providerId))
    .leftJoin(operator, eq(operator.id, listingOffer.operatorId))
    .where(rated)
    .groupBy(provider.code, provider.name, listingOffer.operatorId, operator.name)
    .orderBy(desc(count()), asc(provider.code));

  const [rows, [rated_], [active], agreements] = await Promise.all([
    grouped.limit(input.pageSize).offset((input.page - 1) * input.pageSize),
    db
      .select({ totalItems: count() })
      .from(listingOffer)
      .innerJoin(provider, eq(provider.id, listingOffer.providerId))
      .leftJoin(operator, eq(operator.id, listingOffer.operatorId))
      .where(rated),
    db
      .select({ totalItems: count() })
      .from(listingOffer)
      .innerJoin(provider, eq(provider.id, listingOffer.providerId))
      .leftJoin(operator, eq(operator.id, listingOffer.operatorId))
      .where(scope),
    activeAgreementRates(db),
  ]);

  /*
   * The group count, not the offer count: paging is over operators, and the coverage figures
   * below answer the question about offers. A separate count over the grouping rather than
   * `rows.length`, or the last page would claim to be the whole table.
   */
  const [groups] = await db.select({ totalItems: sql<number>`count(*)::int` }).from(
    db
      .select({ one: sql`1` })
      .from(listingOffer)
      .innerJoin(provider, eq(provider.id, listingOffer.providerId))
      .leftJoin(operator, eq(operator.id, listingOffer.operatorId))
      .where(rated)
      .groupBy(provider.code, listingOffer.operatorId, operator.name)
      .as("grouped"),
  );

  const items = rows.map((row) => ({
    provider: asProviderKey(row.providerCode),
    providerName: row.providerName,
    operatorId: row.operatorId,
    operatorName: row.operatorName,
    offerCount: row.offerCount,
    minPct: Number(row.minPct),
    maxPct: Number(row.maxPct),
    commonPct: Number(row.commonPct),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    /* The typed rate that covers this operator today: one written for it, or failing that
       the vendor-wide one, which is the same precedence `resolveCommissionRate` applies. */
    agreementPct:
      agreements.get(`${row.providerCode}|${row.operatorId ?? ""}`) ??
      agreements.get(`${row.providerCode}|`) ??
      null,
  }));

  return {
    items,
    pagination: paginationFor({
      page: input.page,
      pageSize: input.pageSize,
      totalItems: groups?.totalItems ?? 0,
      itemCount: items.length,
    }),
    coverage: {
      offersWithRate: rated_?.totalItems ?? 0,
      activeOffers: active?.totalItems ?? 0,
    },
  };
}

/** The hand-typed rates in force today, keyed provider|operator (empty operator = vendor-wide). */
async function activeAgreementRates(db: Database): Promise<Map<string, number>> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      providerCode: provider.code,
      operatorId: providerCommission.operatorId,
      ratePct: providerCommission.ratePct,
    })
    .from(providerCommission)
    .innerJoin(provider, eq(provider.id, providerCommission.providerId))
    .where(
      and(
        eq(providerCommission.active, true),
        sql`(${providerCommission.startsAt} is null or ${providerCommission.startsAt} <= ${today})`,
        sql`(${providerCommission.endsAt} is null or ${providerCommission.endsAt} >= ${today})`,
      ),
    );

  const rates = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.providerCode}|${row.operatorId ?? ""}`;
    /* Overlapping windows are possible, and the resolver settles them by taking the higher
       rate; this shows the same figure rather than a second opinion. */
    rates.set(key, Math.max(rates.get(key) ?? 0, Number(row.ratePct)));
  }
  return rates;
}
