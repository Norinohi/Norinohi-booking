import { ORPCError } from "@orpc/server";
import { session, user } from "@yacht-charter/db/schema/auth";
import { eq } from "drizzle-orm";

import type { Database } from "../context";
import type { Profile, ProfileUpdateInput } from "../contracts/profile";

type Db = Database;

export async function getProfile(db: Db, userId: string): Promise<Profile> {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!row) {
    throw new ORPCError("NOT_FOUND");
  }

  return {
    userId: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    // Preference columns do not exist yet; these become persisted in a later milestone.
    locale: "en",
    currency: "EUR",
    marketingOptIn: false,
  };
}

export async function updateProfile(
  db: Db,
  userId: string,
  input: ProfileUpdateInput,
): Promise<Profile> {
  const patch: Partial<{ name: string; phone: string | null }> = {};
  if (input.name !== undefined) {
    patch.name = input.name;
  }
  if (input.phone !== undefined) {
    patch.phone = input.phone;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(user).set(patch).where(eq(user.id, userId));
  }

  return getProfile(db, userId);
}

export async function deactivateProfile(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(user).set({ deactivatedAt: new Date() }).where(eq(user.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
  });
}
