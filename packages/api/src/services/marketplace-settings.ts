import { eq } from "drizzle-orm";

import { marketplaceSetting } from "@yacht-charter/db/schema/admin";

import type { DatabaseExecutor } from "../context";
import { DEFAULT_PAYMENT_SETTINGS, type MarketplacePaymentSettings } from "./pricing";

const SINGLETON_ID = "singleton";

export interface MarketplaceSettings {
  payment: MarketplacePaymentSettings;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

/**
 * The stored settings, or the defaults when nothing has been written.
 *
 * An absent row is not an error and not a reason to refuse a quote: a database that has never
 * seen the admin screen prices exactly as it did before the table existed, which is what
 * `DEFAULT_PAYMENT_SETTINGS` spells out.
 */
export async function getMarketplaceSettings(db: DatabaseExecutor): Promise<MarketplaceSettings> {
  const [row] = await db
    .select()
    .from(marketplaceSetting)
    .where(eq(marketplaceSetting.id, SINGLETON_ID))
    .limit(1);

  if (!row) {
    return { payment: DEFAULT_PAYMENT_SETTINGS, updatedAt: null, updatedByUserId: null };
  }

  return {
    payment: {
      source: row.paymentPolicySource,
      mode: row.marketplaceMode,
      // `numeric` arrives as a string, and a percentage read as NaN would silently become the
      // default rather than the figure an operator typed.
      depositPct: Number(row.marketplaceDepositPct),
      enforceLeadTime: row.enforceDepositLeadTime,
      leadTimeDays: row.depositLeadTimeDays,
    },
    updatedAt: row.updatedAt.toISOString(),
    updatedByUserId: row.updatedByUserId,
  };
}

export interface UpdateMarketplaceSettingsInput {
  payment: MarketplacePaymentSettings;
  actorUserId: string | null;
}

/**
 * Writes the singleton, creating it on first save.
 *
 * `onConflictDoUpdate` rather than a read-then-write: two admins saving at once would
 * otherwise both insert, and the check constraint would turn the loser into a 500 on a screen
 * where the honest outcome is simply that the last save wins.
 */
export async function updateMarketplaceSettings(
  db: DatabaseExecutor,
  input: UpdateMarketplaceSettingsInput,
): Promise<MarketplaceSettings> {
  const values = {
    paymentPolicySource: input.payment.source,
    marketplaceMode: input.payment.mode,
    marketplaceDepositPct: input.payment.depositPct.toFixed(4),
    enforceDepositLeadTime: input.payment.enforceLeadTime,
    depositLeadTimeDays: input.payment.leadTimeDays,
    updatedByUserId: input.actorUserId,
  };

  await db
    .insert(marketplaceSetting)
    .values({ id: SINGLETON_ID, ...values })
    .onConflictDoUpdate({
      target: marketplaceSetting.id,
      set: { ...values, updatedAt: new Date() },
    });

  return getMarketplaceSettings(db);
}
