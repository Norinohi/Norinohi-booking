/*
 * The seam between guest checkout and the set-your-password email.
 *
 * Guest checkout provisions an account the customer never asked for and cannot sign into, so it
 * owes them an invitation to claim it. The link is better-auth's own single-use reset token —
 * asking for one is the only way to mint it — and `welcome=1` on the redirect tells the sender
 * in packages/auth to use the first-password template instead of the forgot-password one, and
 * the /reset-password screen to title itself "Set your password".
 */
import { auth } from "@yacht-charter/auth";
import { env } from "@yacht-charter/env/server";

export type AccountInvitation = {
  userId: string;
  email: string;
  name: string;
};

/** Templates are English-only for now, matching booking-email.ts. */
const LOCALE = "en";

export async function inviteToSetPassword(invitation: AccountInvitation): Promise<void> {
  const redirectTo = `${env.CORS_ORIGIN}/${LOCALE}/reset-password?welcome=1`;

  try {
    await auth.api.requestPasswordReset({ body: { email: invitation.email, redirectTo } });
  } catch (cause) {
    // An unsent invitation is an account nobody can reach, but it must not fail the booking
    // that just succeeded — the customer can still ask for a link from the sign-in page.
    console.error(
      `[account-invitation] could not send the set-password link to ${invitation.email} (user ${invitation.userId})`,
      cause,
    );
  }
}
