import { call, ORPCError } from "@orpc/server";
import { describe, expect, it } from "vitest";

import type { Context } from "./context";
import { adminProcedure, requireRole, protectedProcedure } from "./index";
import { hasRole } from "./roles";

type Session = NonNullable<Context["session"]>;

type StubUser = { id: string; role?: string };

function contextFor(user: StubUser | null): Context {
  // SAFETY: only `user.role` is read, by the role check under test; the rest of the session
  // is never touched, so a missing field is a TypeError rather than a quietly wrong answer.
  const session = user
    ? Object.assign({} as Session, { user: Object.assign({} as Session["user"], user) })
    : null;
  // SAFETY: a stub with nothing behind it. The procedures below never read db or provider.
  return Object.assign({} as Context, { auth: null, session });
}

async function codeOf(procedure: typeof adminProcedure, context: Context): Promise<string> {
  try {
    await call(
      procedure.handler(() => "ok"),
      undefined,
      { context },
    );
    return "ok";
  } catch (error) {
    if (error instanceof ORPCError) return error.code;
    throw error;
  }
}

describe("hasRole", () => {
  it("admits only the roles named", () => {
    const staff = contextFor({ id: "u", role: "staff" }).session;
    expect(hasRole(staff, "staff", "admin")).toBe(true);
    expect(hasRole(staff, "admin")).toBe(false);
  });

  it("refuses no session, a missing role and a role the enum does not know", () => {
    expect(hasRole(null, "customer")).toBe(false);
    expect(hasRole(contextFor({ id: "u" }).session, "customer")).toBe(false);
    expect(hasRole(contextFor({ id: "u", role: "skipper" }).session, "customer")).toBe(false);
  });
});

describe("adminProcedure", () => {
  it("keeps staff and admin on the same side of the gate", async () => {
    expect(await codeOf(adminProcedure, contextFor(null))).toBe("UNAUTHORIZED");
    expect(await codeOf(adminProcedure, contextFor({ id: "u", role: "customer" }))).toBe(
      "FORBIDDEN",
    );
    expect(await codeOf(adminProcedure, contextFor({ id: "u" }))).toBe("FORBIDDEN");
    expect(await codeOf(adminProcedure, contextFor({ id: "u", role: "staff" }))).toBe("ok");
    expect(await codeOf(adminProcedure, contextFor({ id: "u", role: "admin" }))).toBe("ok");
  });

  it("narrows to one role with requireRole", async () => {
    const adminOnly = protectedProcedure.use(requireRole("admin"));
    expect(await codeOf(adminOnly, contextFor({ id: "u", role: "staff" }))).toBe("FORBIDDEN");
  });
});
