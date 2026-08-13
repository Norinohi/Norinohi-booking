import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

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
