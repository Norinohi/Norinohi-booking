import "server-only";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { cache } from "react";

import { redirect } from "@/i18n/navigation";
import { authClient, isStaffRole, userRole } from "@/lib/auth-client";

export type AdminUser = { name: string; email: string; role: string };

/**
 * The session behind the (admin) route group.
 *
 * The layout gates on it and each page needs the user's name for the sidebar; `cache`
 * collapses both into one call to the auth server per render pass.
 */
export const getAdminUser = cache(async (): Promise<AdminUser | null> => {
  const session = await authClient.getSession({
    fetchOptions: { headers: await headers(), throw: true },
  });

  if (!session?.user) return null;

  const role = userRole(session.user);
  return { name: session.user.name, email: session.user.email, role: role ?? "" };
});

/** The same staff/admin gate the API's staffProcedure applies. */
export function isStaff(user: AdminUser | null): boolean {
  return isStaffRole(user?.role ?? null);
}

/**
 * The gate itself, for staff pages that live outside the (admin) route group — the Discount
 * Manager and its overlays, which sit under /profile for their URL. Each of those had its own
 * copy of the session read and the two redirects; the intercepted modal routes had none at all,
 * because there was nothing to copy from. Throws the redirect, so callers need not return it.
 *
 * The API refuses these callers anyway (every discount procedure is an adminProcedure); this is
 * what stops a customer reaching a screen that would only fill with errors.
 */
export async function requireStaffPage(): Promise<AdminUser> {
  const [locale, user] = await Promise.all([getLocale(), getAdminUser()]);

  /* `redirect` throws, but its declared return type is void, so the narrowing is explicit. */
  if (!user || !isStaff(user)) {
    redirect({ href: user ? "/profile" : "/login", locale });
    throw new Error("unreachable: redirect throws");
  }

  return user;
}
