import { ORPCError } from "@orpc/server";
import { referral, referralRedemption } from "@yacht-charter/db/schema/account";
import { and, eq } from "drizzle-orm";

import type { Database } from "../context";
import type { ReferralClaimResult, ReferralCode } from "../contracts/referral";
import { randomCode, withUniqueRetry } from "./random-code";

const CODE_LENGTH = 8;
const CODE_PREFIX = "NORI-";

/** Returns the user's active referral code, minting one on first read. */
export async function getOrCreateReferralCode(db: Database, userId: string): Promise<ReferralCode> {
  const [existing] = await db
    .select({ code: referral.code, active: referral.active })
    .from(referral)
    .where(eq(referral.userId, userId))
    .limit(1);

  if (existing?.active) return presentCode(existing.code);

  return presentCode(await issueCode(db, userId));
}

/** Issues a fresh code, retiring the previous one so old share links stop crediting. */
export async function rotateReferralCode(db: Database, userId: string): Promise<ReferralCode> {
  return presentCode(await issueCode(db, userId));
}

/**
 * Links the signing-up user to the owner of `code`. Called once right after signup;
 * crediting happens later, when the referred user's first booking completes.
 */
export async function claimReferralCode(
  db: Database,
  userId: string,
  code: string,
): Promise<ReferralClaimResult> {
  const normalized = normalizeReferralCode(code);

  const [owner] = await db
    .select({ id: referral.id, userId: referral.userId })
    .from(referral)
    .where(and(eq(referral.code, normalized), eq(referral.active, true)))
    .limit(1);

  if (!owner) return { accepted: false, code: normalized, reason: "unknown_code" };
  if (owner.userId === userId) return { accepted: false, code: normalized, reason: "own_code" };

  const [alreadyReferred] = await db
    .select({ id: referralRedemption.id })
    .from(referralRedemption)
    .where(eq(referralRedemption.referredUserId, userId))
    .limit(1);

  if (alreadyReferred) return { accepted: false, code: normalized, reason: "already_referred" };

  await db
    .insert(referralRedemption)
    .values({ referralId: owner.id, referredUserId: userId, status: "pending" })
    // A double-submit from the signup screen must not 500.
    .onConflictDoNothing();

  return { accepted: true, code: normalized, reason: null };
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

function presentCode(code: string): ReferralCode {
  return { code, urlPath: `/register?ref=${encodeURIComponent(code)}` };
}

/**
 * Upserts the caller's single `referral` row with a freshly generated code. Both
 * unique constraints (user_id, code) route through one statement: user_id conflicts
 * update in place, code conflicts throw and are retried with a new code.
 */
async function issueCode(db: Database, userId: string): Promise<string> {
  // The collision space is 32^8, so a handful of retries is far more than enough.
  const row = await withUniqueRetry(5, async () => {
    const code = `${CODE_PREFIX}${randomCode(CODE_LENGTH)}`;

    const [inserted] = await db
      .insert(referral)
      .values({ userId, code, active: true })
      .onConflictDoUpdate({
        target: referral.userId,
        set: { code, active: true, updatedAt: new Date() },
      })
      .returning({ code: referral.code });

    return inserted;
  });

  if (!row) {
    throw new ORPCError("INTERNAL_SERVER_ERROR", {
      message: "Could not allocate a unique referral code",
    });
  }
  return row.code;
}
