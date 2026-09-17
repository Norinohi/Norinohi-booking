/*
 * Whose account a set-password link belongs to, so the screen can tell a visitor who is already
 * signed in as someone else that the password goes to a different account.
 *
 * Reads better-auth's verification row directly: it has no endpoint for this. The token already
 * lets its holder set the password, so naming the address behind it discloses nothing more.
 */
import { user, verification } from "@yacht-charter/db/schema/auth";
import { and, eq, gt } from "drizzle-orm";

import type { Database } from "../context";
import type { PasswordResetTarget } from "../contracts/password-reset";

export async function passwordResetTarget(
  db: Database,
  token: string,
): Promise<PasswordResetTarget> {
  const [row] = await db
    .select({ userId: user.id, email: user.email })
    .from(verification)
    .innerJoin(user, eq(user.id, verification.value))
    .where(
      and(
        eq(verification.identifier, `reset-password:${token}`),
        gt(verification.expiresAt, new Date()),
      ),
    )
    .limit(1);

  return row ?? null;
}
