import type { AppPathname } from "@/i18n/navigation";

/*
 * The account menu's rows, in Figma order. Both the sidebar and the header dropdown read this
 * list: the dropdown had its own hand-written subset of the admin rows and had already fallen
 * four behind the sidebar, which is the failure one shared list removes.
 */
export const ACCOUNT_ITEMS = ["profile", "bookings", "referrals", "credits"] as const;

const ADMIN_ITEM_NAMES = [
  "inbox",
  "staffBookings",
  "payments",
  "listings",
  "routes",
  "faq",
  "discount",
  "duplicates",
  "sync",
  "audit",
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
  row("payments"),
  group("fleet", ["listings", "duplicates", "sync"]),
  group("content", ["routes", "faq"]),
  row("discount"),
  row("audit"),
];

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
  /* The (admin) route group is URL-invisible, so these sit at the root, not under /profile. */
  ["inbox", "/inbox"],
  /* Not "bookings": that key is the customer's own /profile/bookings, and both rows are on
     screen at once for a staff session. */
  ["staffBookings", "/staff/bookings"],
  ["payments", "/payments"],
  ["listings", "/listings"],
  ["routes", "/routes"],
  ["faq", "/faq"],
  ["duplicates", "/duplicates"],
  ["sync", "/sync"],
  ["audit", "/audit"],
]);
