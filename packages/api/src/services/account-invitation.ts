/*
 * The seam between guest checkout and the set-your-password email.
 *
 * Guest checkout provisions an account the customer never asked for and cannot sign into, so it
 * owes them an invitation to claim it. The link is better-auth's own single-use reset token —
 * asking for one is the only way to mint it — and `welcome=1` on the redirect tells the sender
 * in packages/auth to use the first-password template instead of the forgot-password one, and
 * the /reset-password screen to title itself "Set your password".
 *
 * Reached from the outbox rather than from checkout: minting the token writes a row and the send
 * is an HTTP call to Resend, and the customer was waiting on both. Failures throw here, because
 * the outbox is now the thing that retries them — an invitation nobody receives is an account
 * nobody can reach.
 */
import { auth } from "@yacht-charter/auth";
import { user } from "@yacht-charter/db/schema/auth";
import { env } from "@yacht-charter/env/server";
import { eq } from "drizzle-orm";

import type { Database } from "../context";

/** Templates are English-only for now, matching booking-email.ts. */
const LOCALE = "en";

export async function sendAccountInvitation(db: Database, userId: string): Promise<void> {
  const [invitee] = await db
    .select({ email: user.email, provisionedAt: user.provisionedAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  // Deleted between the enqueue and the drain, which is not a failure to retry.
  if (!invitee) return;

  /*
   * A guest who claimed the account in the meantime — or an address that turned out to
   * belong to a real sign-up — must not be sent a set-password link they never asked
   * for. `provisionedAt` is cleared when the password is chosen, so this is the check
   * that makes a late or duplicated delivery harmless.
   */
  if (!invitee.provisionedAt) return;

  const redirectTo = `${env.CORS_ORIGIN}/${LOCALE}/reset-password?welcome=1`;

  await auth.api.requestPasswordReset({ body: { email: invitee.email, redirectTo } });
}
