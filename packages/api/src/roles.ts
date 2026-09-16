import { userRole } from "@yacht-charter/db/schema/auth";
import { z } from "zod";

import type { Context } from "./context";

/**
 * A platform role, read from the `user_role` database enum rather than restated.
 *
 * Adding a role (a skipper) is one value in that enum in `packages/db/src/schema/auth.ts` plus
 * its generated migration; this type, `roleSchema` and the admin user filter pick it up from
 * there, and a procedure for it is `protectedProcedure.use(requireRole("skipper"))`.
 */
export type Role = (typeof userRole.enumValues)[number];

export const roleSchema = z.enum(userRole.enumValues);

/** better-auth carries `role` as an additional field, outside its own user type. */
const sessionRoleSchema = z.object({ role: roleSchema });

type Session = Context["session"];

/**
 * Whether the session's user holds one of `roles`. False for no session, and for a user whose
 * role is missing or not one the enum knows, so an unexpected value is refused, never admitted.
 */
export function hasRole(session: Session | undefined, ...roles: Role[]): boolean {
  if (!session) return false;
  const parsed = sessionRoleSchema.safeParse(session.user);
  return parsed.success && roles.includes(parsed.data.role);
}
