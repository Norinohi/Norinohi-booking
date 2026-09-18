import type { AppPathname } from "@/i18n/navigation";
import type { SessionUser } from "@/lib/auth-client";
import { hasRole, type Role, STAFF_ROLES } from "@/lib/auth/roles";

/*
 * The account menu's rows, in Figma order. Both the sidebar and the header dropdown read this
 * list: the dropdown had its own hand-written subset of the admin rows and had already fallen
 * four behind the sidebar, which is the failure one shared list removes.
 */
export const ACCOUNT_ITEMS = ["profile", "bookings", "referrals", "credits"] as const;

const ADMIN_ITEM_NAMES = [
  "inbox",
  "staffBookings",
  "users",
  "payments",
  "listings",
  "routes",
  "faq",
  "popular",
  "popularYachts",
  "discount",
  "commission",
  "duplicates",
  "sync",
  "audit",
  "settings",
] as const;

export type AccountNavItem = (typeof ACCOUNT_ITEMS)[number] | (typeof ADMIN_ITEM_NAMES)[number];

export const ADMIN_GROUP_KEYS = ["fleet", "content"] as const;
export type AdminGroupKey = (typeof ADMIN_GROUP_KEYS)[number];

/* Tagged rather than "a string is a row, an object is a group": the sidebar branches on this,
   and a discriminant says which case it is instead of asking what shape it happens to have. */
export type NavEntry =
  | { readonly kind: "item"; readonly item: AccountNavItem }
  | {
      readonly kind: "group";
      readonly group: AdminGroupKey;
      readonly items: readonly AccountNavItem[];
    };

const row = (item: AccountNavItem): NavEntry => ({ kind: "item", item });
const group = (group: AdminGroupKey, items: readonly AccountNavItem[]): NavEntry => ({
  kind: "group",
  group,
  items,
});

export const ACCOUNT_NAV: readonly NavEntry[] = ACCOUNT_ITEMS.map(row);

/*
 * Ten flat admin rows buried the five that are used daily, so the two clusters that are one
 * job seen from different angles collapse behind a parent row: everything about the fleet's
 * yachts, and everything the site publishes that isn't a yacht. Collapsed by default - a
 * group opens itself only when the current page is inside it.
 */
export const ADMIN_NAV: readonly NavEntry[] = [
  row("inbox"),
  row("staffBookings"),
  row("users"),
  row("payments"),
  group("fleet", ["listings", "duplicates", "sync"]),
  group("content", ["routes", "faq", "popular", "popularYachts"]),
  row("discount"),
  row("commission"),
  row("audit"),
  row("settings"),
];

export type NavSectionKey = "account" | "admin";

export interface NavSection {
  readonly key: NavSectionKey;
  /** Absent for a section every signed-in reader gets. */
  readonly roles?: readonly Role[];
  readonly entries: readonly NavEntry[];
}

/*
 * Every menu section and who sees it. A role-specific area (a skipper's cabinet) is one more entry
 * here, and both the sidebar and the header dropdown pick it up without a new conditional.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  { key: "account", entries: ACCOUNT_NAV },
  { key: "admin", roles: STAFF_ROLES, entries: ADMIN_NAV },
];

export function canSeeNavSection(
  section: NavSection,
  user: SessionUser | null | undefined,
): boolean {
  return section.roles === undefined || hasRole(user, ...section.roles);
}

/* Flattened for the header dropdown, which has no room to nest and lists every row at once. */
export const ADMIN_ITEMS: readonly AccountNavItem[] = ADMIN_NAV.flatMap((entry) =>
  entry.kind === "group" ? entry.items : [entry.item],
);

/* Only wired pages get an href; the rest stay inert until their routes exist. */
export const ACCOUNT_NAV_HREFS = new Map<AccountNavItem, AppPathname>([
  ["profile", "/profile"],
  ["bookings", "/profile/bookings"],
  ["referrals", "/profile/referrals"],
  ["credits", "/profile/credits"],
  ["discount", "/profile/discounts"],
  /* Staff screens live under /admin so they never collide with a public path. */
  ["commission", "/admin/commissions"],
  ["inbox", "/admin/inbox"],
  /* Not "bookings": that key is the customer's own /profile/bookings, and both rows are on
     screen at once for a staff session. */
  ["staffBookings", "/admin/staff/bookings"],
  ["users", "/admin/users"],
  ["payments", "/admin/payments"],
  ["listings", "/admin/listings"],
  ["routes", "/admin/routes"],
  ["faq", "/admin/faq"],
  ["popular", "/admin/popular"],
  ["popularYachts", "/admin/popular-yachts"],
  ["duplicates", "/admin/duplicates"],
  ["sync", "/admin/sync"],
  ["audit", "/admin/audit"],
  ["settings", "/admin/settings"],
]);
