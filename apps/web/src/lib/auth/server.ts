import "server-only";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { cache } from "react";

import { redirect } from "@/i18n/navigation";
import { authClient, type SessionUser } from "@/lib/auth-client";

import { hasRole, type Role } from "./roles";

/**
 * The signed-in user for this request, or null.
 *
 * A layout gates on it and the page under it reads it again for the sidebar greeting; `cache`
 * collapses both into one call to the auth server per render pass.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await authClient.getSession({
    fetchOptions: { headers: await headers(), throw: true },
  });
  return session?.user ?? null;
});

/** Sends a signed-out visitor to /login. Throws the redirect, so callers need not return it. */
export async function requireSignedIn(): Promise<SessionUser> {
  const [locale, user] = await Promise.all([getLocale(), getSessionUser()]);

  /* `redirect` throws, but its declared return type is void, so the narrowing is explicit. */
  if (!user) {
    redirect({ href: "/login", locale });
    throw new Error("unreachable: redirect throws");
  }

  return user;
}

/**
 * Admits a user holding one of `roles`: signed out goes to /login, any other role to /profile.
 * The API enforces the same rule on every procedure; this only keeps a reader off a screen that
 * would fill with errors.
 */
export async function requireRole(...roles: readonly Role[]): Promise<SessionUser> {
  const user = await requireSignedIn();

  if (!hasRole(user, ...roles)) {
    redirect({ href: "/profile", locale: await getLocale() });
    throw new Error("unreachable: redirect throws");
  }

  return user;
}
