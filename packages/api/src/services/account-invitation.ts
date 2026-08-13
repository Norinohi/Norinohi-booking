/*
 * The seam between guest checkout and the set-your-password email.
 *
 * Guest checkout provisions an account the customer never asked for and cannot sign
 * into, so it owes them an invitation to claim it. Sending that mail is the email
 * workstream's job (better-auth's password-reset token plus a Resend template); this
 * records the intent and is the single place that call goes when it lands, so wiring
 * it never means editing the checkout flow.
 */

export type AccountInvitation = {
  userId: string;
  email: string;
  name: string;
};

export async function inviteToSetPassword(invitation: AccountInvitation): Promise<void> {
  // Deliberately loud rather than silent: until the mail is wired, an unsent
  // invitation is an account nobody can reach, and that should be visible in the log.
  console.warn(
    `[account-invitation] no sender wired — ${invitation.email} cannot set a password yet (user ${invitation.userId})`,
  );
  return Promise.resolve();
}
