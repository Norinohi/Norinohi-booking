import type { Role } from "@yacht-charter/api/roles";
import { z } from "zod";

import type { SessionUser } from "@/lib/auth-client";

export type { Role };

/** Who reaches the admin area, the same pair the API's `adminProcedure` admits. */
export const STAFF_ROLES = ["staff", "admin"] as const satisfies readonly Role[];

/*
 * better-auth's client types leave out the `role` additional field, so it is parsed off the user
 * rather than asserted. The check compares against the requested roles instead of a schema of the
 * whole enum because that enum lives in packages/db, which must stay out of the browser bundle.
 */
const sessionRoleSchema = z.object({ role: z.string() });

/** False for no user, and for a role that is missing or not one of `roles`. */
export function hasRole(user: SessionUser | null | undefined, ...roles: readonly Role[]): boolean {
  if (!user) return false;
  const parsed = sessionRoleSchema.safeParse(user);
  return parsed.success && roles.some((role) => role === parsed.data.role);
}
