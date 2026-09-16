import { ORPCError, os } from "@orpc/server";

import type { Context } from "./context";
import { DomainError } from "./errors";
import { domainErrorToORPCError } from "./orpc-errors";
import { hasRole, type Role } from "./roles";

export const o = os.$context<Context>();

/*
 * Outermost on every procedure, so a refusal thrown by a service from any handler or later
 * middleware reaches the handler as the `ORPCError` it used to throw itself. Without it oRPC
 * would report the unknown error as a bare INTERNAL_SERVER_ERROR.
 */
const translateDomainErrors = o.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error instanceof DomainError) throw domainErrorToORPCError(error);
    throw error;
  }
});

export const publicProcedure = o.use(translateDomainErrors);

const requireAuth = o.middleware(async ({ context, next }) => {
  if (!context.session?.user) {
    throw new ORPCError("UNAUTHORIZED");
  }
  return next({
    context: {
      session: context.session,
    },
  });
});

export const protectedProcedure = publicProcedure.use(requireAuth);

export function requireRole(...roles: Role[]) {
  return o.middleware(async ({ context, next }) => {
    const session = context.session;
    if (!session) {
      throw new ORPCError("UNAUTHORIZED");
    }

    if (!hasRole(session, ...roles)) {
      throw new ORPCError("FORBIDDEN");
    }

    return next({
      context: {
        session,
      },
    });
  });
}

/** Staff and admin share every admin screen today; split a procedure off with its own `requireRole`. */
export const adminProcedure = protectedProcedure.use(requireRole("staff", "admin"));
