import { ORPCError, os } from "@orpc/server";
import { parseError } from "evlog";

import type { Context } from "./context";
import { DomainError } from "./errors";
import { domainErrorToORPCError } from "./orpc-errors";
import { hasRole, type Role } from "./roles";
import { describeThrown, recordErrorInAudit } from "./services/error-audit";

export const o = os.$context<Context>();

/*
 * Errors a staff failure already wrote, so the 5xx recorder further out does not write the same
 * one again. Keyed on the error object, which is also the cause of the ORPCError it becomes.
 */
const recordedErrors = new WeakSet<Error>();

function alreadyRecorded(error: Error): boolean {
  return (
    recordedErrors.has(error) || (error.cause instanceof Error && recordedErrors.has(error.cause))
  );
}

/*
 * Outermost on every procedure, so a refusal thrown by a service from any handler or later
 * middleware reaches the handler as the `ORPCError` it used to throw itself. Without it oRPC
 * would report the unknown error as a bare INTERNAL_SERVER_ERROR.
 *
 * It also records any 5xx in the audit log, whoever asked. A 4xx is a visitor being refused,
 * which is not ours to record. One middleware rather than two: each `.use` widens the context
 * type every procedure carries, and `appRouter` is already at the limit tsc will serialize.
 */
const translateDomainErrors = o.middleware(async ({ context, next, path }, input) => {
  try {
    return await next();
  } catch (error) {
    const sent = error instanceof DomainError ? domainErrorToORPCError(error) : error;
    const thrown = parseError(sent);

    const unrecorded = !(error instanceof Error && alreadyRecorded(error));
    if (unrecorded && describeThrown(thrown).status >= 500) {
      const operation = path.join(".");
      await recordErrorInAudit(context.db, {
        source: "server",
        operation,
        thrown,
        actorUserId: context.session?.user.id ?? null,
        entityType: "procedure",
        entityId: operation,
        context: { input },
      });
    }

    throw sent;
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

/*
 * `requireRole("staff", "admin")` plus a record of every failure past the role check, refusals
 * included: a 409 on an admin screen is still something a colleague may need to see, and the
 * actor is always a staff user. A refused role check is not recorded; that caller is not staff.
 */
const requireStaff = o.middleware(async ({ context, next, path }, input) => {
  const session = context.session;
  if (!session) {
    throw new ORPCError("UNAUTHORIZED");
  }

  if (!hasRole(session, "staff", "admin")) {
    throw new ORPCError("FORBIDDEN");
  }

  try {
    return await next({ context: { session } });
  } catch (error) {
    const operation = path.join(".");
    await recordErrorInAudit(context.db, {
      source: "admin_action",
      operation,
      thrown: parseError(error),
      actorUserId: session.user.id,
      entityType: "procedure",
      entityId: operation,
      context: { input },
    });
    if (error instanceof Error) recordedErrors.add(error);
    throw error;
  }
});

/** Staff and admin share every admin screen today; split a procedure off with its own `requireRole`. */
export const adminProcedure = protectedProcedure.use(requireStaff);
