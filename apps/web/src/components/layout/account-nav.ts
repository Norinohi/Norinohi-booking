import type { AppPathname } from "@/i18n/navigation";

/*
 * The account menu's rows, in Figma order. Both the sidebar and the header dropdown read this
 * list: the dropdown had its own hand-written subset of the admin rows and had already fallen
 * four behind the sidebar, which is the failure one shared list removes.
 */
export const ACCOUNT_ITEMS = ["profile", "bookings", "referrals", "credits"] as const;

export const ADMIN_ITEMS = [
  "inbox",
  "payments",
  "listings",
  "discount",
  "duplicates",
  "sync",
  "audit",
] as const;

export type AccountNavItem = (typeof ACCOUNT_ITEMS)[number] | (typeof ADMIN_ITEMS)[number];

/* Only wired pages get an href; the rest stay inert until their routes exist. */
export const ACCOUNT_NAV_HREFS = new Map<AccountNavItem, AppPathname>([
  ["profile", "/profile"],
  ["bookings", "/profile/bookings"],
  ["referrals", "/profile/referrals"],
  ["credits", "/profile/credits"],
  ["discount", "/profile/discounts"],
  /* The (admin) route group is URL-invisible, so these sit at the root, not under /profile. */
  ["inbox", "/inbox"],
  ["payments", "/payments"],
  ["listings", "/listings"],
  ["duplicates", "/duplicates"],
  ["sync", "/sync"],
  ["audit", "/audit"],
]);
