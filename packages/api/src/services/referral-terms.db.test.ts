import "../test-support/checkout-env";

import { referral, referralRedemption } from "@yacht-charter/db/schema/account";
import { creditLedger } from "@yacht-charter/db/schema/loyalty";
import { createTestDatabase, type TestDatabase } from "@yacht-charter/db/test-support/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  holdQuote,
  quoteWeek,
  seedBookingWorld,
  seedCustomer,
  seedYacht,
} from "../test-support/booking-world";
import type { MockInventoryProvider } from "@yacht-charter/providers/mock/provider";
import { awardReferralCredit, creditBalanceMinor, CREDIT_CURRENCY } from "./loyalty";
import { spendableCreditMinor, welcomeDiscountMinor } from "./loyalty";
import { getMarketplaceSettings, updateMarketplaceSettings } from "./marketplace-settings";

/*
 * The referral programme's terms are a setting, not a constant.
 *
 * What these pin is that the setting is load-bearing: every figure the Referrals page quotes
 * has a rule behind it, and the rules read the row. A field that saves and changes nothing is
 * the failure worth testing for -- it looks right on the admin screen and pays out the old
 * number, which nobody notices until a customer counts.
 */

let test: TestDatabase;
let inventory: MockInventoryProvider;
let listingId: string;
let referrerId: string;
let referralId: string;
let staffId: string;

beforeAll(async () => {
  test = await createTestDatabase();
  inventory = await seedBookingWorld(test.db);
  ({ listingId } = await seedYacht(test.db, "termsboat"));
  referrerId = await seedCustomer(test.db, "usr_referrer");
  staffId = await seedCustomer(test.db, "usr_terms_staff");

  /* One code per person, as the table enforces; each case adds its own invitee to it. */
  const [code] = await test.db
    .insert(referral)
    .values({ userId: referrerId, code: "NORI-TERMS01" })
    .returning({ id: referral.id });
  if (!code) throw new Error("referral not seeded");
  referralId = code.id;
}, 120_000);

afterAll(async () => {
  await test?.drop();
});

/** Saves one term, leaving every other setting exactly as it was. */
async function setTerms(patch: Partial<Awaited<ReturnType<typeof currentTerms>>>) {
  const current = await getMarketplaceSettings(test.db);
  await updateMarketplaceSettings(test.db, {
    ...current,
    referral: { ...current.referral, ...patch },
    actorUserId: staffId,
  });
}

async function currentTerms() {
  return (await getMarketplaceSettings(test.db)).referral;
}

/** A friend who has signed up on the referrer's code and not yet sailed. */
async function seedPendingReferral(suffix: string): Promise<string> {
  const invitee = await seedCustomer(test.db, `usr_invitee_${suffix}`);

  await test.db
    .insert(referralRedemption)
    .values({ referralId, referredUserId: invitee, status: "pending" });

  return invitee;
}

describe("the invitee's welcome discount", () => {
  it("comes off at the configured amount, not the one the programme launched with", async () => {
    const invitee = await seedPendingReferral("welcome");
    await setTerms({ inviteeDiscountMinor: 25_000 });

    expect(await welcomeDiscountMinor(test.db, invitee, CREDIT_CURRENCY, 500_000, 500_000)).toBe(
      25_000,
    );
  });

  /* The threshold is the other half of the promise, and the one a booking is measured against. */
  it("is withheld below the configured minimum booking and granted above it", async () => {
    const invitee = await seedPendingReferral("threshold");
    await setTerms({ inviteeDiscountMinor: 10_000, creditMinBookingMinor: 300_000 });

    expect(await welcomeDiscountMinor(test.db, invitee, CREDIT_CURRENCY, 299_900, 299_900)).toBe(0);
    expect(await welcomeDiscountMinor(test.db, invitee, CREDIT_CURRENCY, 300_000, 300_000)).toBe(
      10_000,
    );
  });
});

describe("the referrer's reward", () => {
  it("is granted at the configured amount and expires after the configured months", async () => {
    const invitee = await seedPendingReferral("reward");
    await setTerms({ rewardMinor: 15_000, creditTtlMonths: 3 });

    /* A real booking, because the ledger row points at one: the reward is a fact about a
       charter somebody sailed, not a free-standing grant. */
    const quote = await quoteWeek(test.db, inventory, listingId, invitee);
    const hold = await holdQuote(test.db, inventory, invitee, quote.quoteId);

    const granted = await awardReferralCredit(test.db, invitee, hold.bookingId);

    expect(granted).toMatchObject({ awarded: true, amountMinor: 15_000 });

    /* Three months out, give or take the length of the months crossed. */
    const [entry] = await test.db.query.creditLedger.findMany({
      where: (row, { eq: is }) => is(row.userId, referrerId),
      orderBy: (row, { desc }) => desc(row.createdAt),
      limit: 1,
    });
    const monthsAhead =
      (entry!.expiresAt!.getFullYear() - new Date().getFullYear()) * 12 +
      (entry!.expiresAt!.getMonth() - new Date().getMonth());
    expect(monthsAhead).toBe(3);
  });
});

describe("spending a balance", () => {
  it("respects a minimum booking the admin has raised", async () => {
    /* Its own balance rather than one left behind by the case above, so the two can run in
       either order and this one still says what it means. */
    const spender = await seedCustomer(test.db, "usr_spender");
    await test.db.insert(creditLedger).values({
      userId: spender,
      kind: "referral_reward",
      amountMinor: 12_000,
      currency: CREDIT_CURRENCY,
    });
    await setTerms({ creditMinBookingMinor: 400_000 });

    const balance = await creditBalanceMinor(test.db, spender, CREDIT_CURRENCY);
    expect(balance).toBe(12_000);

    expect(await spendableCreditMinor(test.db, spender, CREDIT_CURRENCY, 399_900, 399_900)).toBe(0);
    expect(await spendableCreditMinor(test.db, spender, CREDIT_CURRENCY, 400_000, 400_000)).toBe(
      balance,
    );
  });
});
