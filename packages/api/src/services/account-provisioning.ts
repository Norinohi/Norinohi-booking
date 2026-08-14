import { randomUUID } from "node:crypto";

import { ORPCError } from "@orpc/server";
import { user } from "@yacht-charter/db/schema/auth";
import { eq } from "drizzle-orm";

import type { Database } from "../context";
import { inviteToSetPassword } from "./account-invitation";

/*
 * The account behind a guest checkout.
 *
 * A booking has to belong to someone — it carries payments, an invoice and a refund
 * path — so checkout without a session provisions the account rather than leaving the
 * row ownerless. The customer is never signed into it: they hold a booking-scoped
 * token (see guest-access.ts) until they accept the invitation and choose a password.
 */

export type ProvisionInput = {
  fullName: string;
  email: string;
  phone: string;
};

export type ProvisionedAccount = {
  userId: string;
  /** False when the email already had an account — nothing was created or emailed. */
  created: boolean;
};

export async function provisionGuestAccount(
  db: Database,
  guest: ProvisionInput,
): Promise<ProvisionedAccount> {
  // better-auth treats the address as the identity and the column is unique, so the
  // case someone happened to type must not decide whether they get a second account.
  const email = guest.email.trim().toLowerCase();

  const existing = await findByEmail(db, email);
  if (existing) return { userId: existing, created: false };

  const [inserted] = await db
    .insert(user)
    .values({
      id: randomUUID(),
      name: guest.fullName,
      email,
      phone: guest.phone,
      emailVerified: false,
      provisionedAt: new Date(),
    })
    // Two checkouts for the same new address can race here; the loser reads the row
    // the winner wrote rather than failing a booking over it.
    .onConflictDoNothing({ target: user.email })
    .returning({ id: user.id });

  if (!inserted) {
    const raced = await findByEmail(db, email);
    if (!raced) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Could not create an account" });
    }
    return { userId: raced, created: false };
  }

  await inviteToSetPassword({ userId: inserted.id, email, name: guest.fullName });

  return { userId: inserted.id, created: true };
}

async function findByEmail(db: Database, email: string): Promise<string | undefined> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  return row?.id;
}
