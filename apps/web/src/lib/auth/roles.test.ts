import { describe, expect, it } from "vitest";

import type { SessionUser } from "@/lib/auth-client";

import { hasRole, STAFF_ROLES } from "./roles";

const USER: SessionUser = {
  id: "user_1",
  name: "Guest",
  email: "guest@example.com",
  emailVerified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  image: null,
};

/* better-auth's client type has no `role`, so a role rides along the way the session sends it. */
const withRole = (role: string | number | null) => ({ ...USER, role });

const customer = withRole("customer");
const staff = withRole("staff");
const admin = withRole("admin");

describe("hasRole", () => {
  it("is false with no user", () => {
    expect(hasRole(null, "admin")).toBe(false);
    expect(hasRole(undefined, ...STAFF_ROLES)).toBe(false);
  });

  it("is false for a user with no role or a non-string role", () => {
    expect(hasRole(USER, "admin")).toBe(false);
    expect(hasRole(withRole(1), "admin")).toBe(false);
    expect(hasRole(withRole(null), "admin")).toBe(false);
  });

  it("matches any of the requested roles", () => {
    expect(hasRole(staff, ...STAFF_ROLES)).toBe(true);
    expect(hasRole(admin, ...STAFF_ROLES)).toBe(true);
    expect(hasRole(customer, ...STAFF_ROLES)).toBe(false);
    expect(hasRole(staff, "admin")).toBe(false);
  });

  it("is false when no roles are requested", () => {
    expect(hasRole(admin)).toBe(false);
  });

  it("compares exactly, not by case or prefix", () => {
    expect(hasRole(withRole("Admin"), "admin")).toBe(false);
    expect(hasRole(withRole("admin "), "admin")).toBe(false);
  });
});
