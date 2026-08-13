import { ORPCError, os } from "@orpc/server";
import { z } from "zod";

import type { Context } from "./context";

/** better-auth carries `role` as an additional field, outside its own user type. */
const staffRoleSchema = z.object({ role: z.enum(["staff", "admin"]) });

export const o = os.$context<Context>();

export const publicProcedure = o;

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

const requireAdmin = o.middleware(async ({ context, next }) => {
  const session = context.session;
  if (!session) {
    throw new ORPCError("UNAUTHORIZED");
  }

  if (!staffRoleSchema.safeParse(session.user).success) {
    throw new ORPCError("FORBIDDEN");
  }

  return next({
    context: {
      session,
    },
  });
});

export const adminProcedure = protectedProcedure.use(requireAdmin);
