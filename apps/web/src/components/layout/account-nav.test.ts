import { describe, expect, it } from "vitest";

import type { SessionUser } from "@/lib/auth-client";

import {
  ADMIN_ITEMS,
  ADMIN_NAV,
  canSeeNavSection,
  NAV_SECTIONS,
  type NavSectionKey,
} from "./account-nav";

const USER: SessionUser = {
  id: "user_1",
  name: "Guest",
  email: "guest@example.com",
  emailVerified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  image: null,
};

const customer = { ...USER, role: "customer" };
const staff = { ...USER, role: "staff" };
const admin = { ...USER, role: "admin" };

describe("canSeeNavSection", () => {
  const section = (key: NavSectionKey) => {
    const found = NAV_SECTIONS.find((candidate) => candidate.key === key);
    if (!found) throw new Error(`no nav section ${key}`);
    return found;
  };

  it("shows the account section to every reader", () => {
    expect(canSeeNavSection(section("account"), customer)).toBe(true);
    expect(canSeeNavSection(section("account"), null)).toBe(true);
  });

  it("shows the admin section to staff and admins only", () => {
    expect(canSeeNavSection(section("admin"), staff)).toBe(true);
    expect(canSeeNavSection(section("admin"), admin)).toBe(true);
    expect(canSeeNavSection(section("admin"), customer)).toBe(false);
    expect(canSeeNavSection(section("admin"), null)).toBe(false);
  });

  it("flattens every admin row, grouped or not, for the dropdown", () => {
    const rows = ADMIN_NAV.reduce(
      (count, entry) => count + (entry.kind === "group" ? entry.items.length : 1),
      0,
    );

    expect(ADMIN_ITEMS).toHaveLength(rows);
    expect(new Set(ADMIN_ITEMS).size).toBe(ADMIN_ITEMS.length);
  });
});
