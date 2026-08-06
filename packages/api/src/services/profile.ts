import { ORPCError } from "@orpc/server";
import { profile } from "@yacht-charter/db/schema/account";
import { session, user } from "@yacht-charter/db/schema/auth";
import { eq } from "drizzle-orm";

import type { Database } from "../context";
import type { Profile, ProfileUpdateInput } from "../contracts/profile";

type Db = Database;

const DEFAULT_LOCALE = "en";
const DEFAULT_CURRENCY = "EUR";

export async function getProfile(db: Db, userId: string): Promise<Profile> {
  const [row] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      userPhone: user.phone,
      firstName: profile.firstName,
      lastName: profile.lastName,
      profilePhone: profile.phone,
      locale: profile.locale,
      currency: profile.currency,
      marketingOptIn: profile.marketingOptIn,
    })
    .from(user)
    .leftJoin(profile, eq(profile.userId, user.id))
    .where(eq(user.id, userId))
    .limit(1);

  if (!row) {
    throw new ORPCError("NOT_FOUND");
  }

  // Accounts created before the profile row exists (and every social sign-in) only
  // have user.name — split it so the two-field form still renders something.
  const fallback = splitName(row.name);

  return {
    userId: row.id,
    name: row.name,
    firstName: row.firstName ?? fallback.firstName,
    lastName: row.lastName ?? fallback.lastName,
    email: row.email,
    // user.phone is what Better Auth writes at signup; the profile row wins once set.
    phone: row.profilePhone ?? row.userPhone,
    locale: row.locale ?? DEFAULT_LOCALE,
    currency: row.currency ?? DEFAULT_CURRENCY,
    marketingOptIn: row.marketingOptIn ?? false,
  };
}

export async function updateProfile(
  db: Db,
  userId: string,
  input: ProfileUpdateInput,
): Promise<Profile> {
  const current = await getProfile(db, userId);

  const firstName = input.firstName !== undefined ? input.firstName : current.firstName;
  const lastName = input.lastName !== undefined ? input.lastName : current.lastName;
  const phone = input.phone !== undefined ? input.phone : current.phone;

  const values = {
    firstName,
    lastName,
    phone,
    locale: input.locale ?? current.locale,
    currency: input.currency ?? current.currency,
    marketingOptIn: input.marketingOptIn ?? current.marketingOptIn,
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(profile)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: profile.userId, set: { ...values, updatedAt: new Date() } });

    // Better Auth owns user.name and user.phone; keep them in step so the greeting
    // ("Hello, John Doe!") and the session payload do not drift from the profile.
    const name = [firstName, lastName].filter(Boolean).join(" ").trim();
    await tx
      .update(user)
      .set({ phone, ...(name ? { name } : {}) })
      .where(eq(user.id, userId));
  });

  return getProfile(db, userId);
}

export async function deactivateProfile(db: Db, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.update(user).set({ deactivatedAt: new Date() }).where(eq(user.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
  });
}

function splitName(full: string): { firstName: string | null; lastName: string | null } {
  const [first, ...rest] = full.trim().split(/\s+/).filter(Boolean);
  return { firstName: first ?? null, lastName: rest.length > 0 ? rest.join(" ") : null };
}
