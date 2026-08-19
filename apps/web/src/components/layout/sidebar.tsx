"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import type { AppPathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useEffect, useId, useState } from "react";

import { authClient, isStaffRole, userRole } from "@/lib/auth-client";

/*
 * Sidebar — Figma "Sidebar" (Reusable Sections, nodes 845:207497 User / 853:58498 Admin).
 * Account menu card: a greeting header over a soft wash, then rows with an active highlight
 * (brand-50 + brand text) and a destructive "Log Out". Admin adds "Inbox", "Payments",
 * "Listings", "Discount Manager", "Duplicate Review", "Sync History" and "Audit Log".
 * Rows with a route render as links and read their active state from the pathname; rows whose
 * page doesn't exist yet stay as inert buttons highlighted only by `defaultActive`.
 *
 * Staff see two labelled groups rather than one long list, because the two halves answer to
 * different people: "My Bookings" is the reader's own charter, "Payments" is everyone's money.
 * The rows themselves stay identical - tinting the admin half would collide with the active
 * and hover states, which are the only colours in here that mean anything. A non-staff
 * session gets no headings at all: one group needs no name to be told apart from nothing.
 */

const BASE_ITEMS = ["profile", "bookings", "referrals", "credits"] as const;

const ADMIN_ITEMS = [
  "inbox",
  "payments",
  "listings",
  "discount",
  "duplicates",
  "sync",
  "audit",
] as const;

type SidebarItem = (typeof BASE_ITEMS)[number] | (typeof ADMIN_ITEMS)[number];

/* Only wired pages get an href; the rest stay inert until their routes exist. */
const HREFS = new Map<SidebarItem, AppPathname>([
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

type SidebarProps = {
  name?: string;
  variant?: "user" | "admin";
  defaultActive?: SidebarItem;
  onLogout?: () => void;
  className?: string;
};

export default function Sidebar({
  name = "John Doe",
  variant = "user",
  defaultActive = "profile",
  onLogout,
  className,
}: SidebarProps) {
  const t = useTranslations("Layout.Sidebar");
  const pathname = usePathname();

  /* Staff/admin sessions see the admin rows on every profile page, not only where a screen
   * passes variant="admin". */
  const { data: session } = authClient.useSession();
  const isStaffUser = isStaffRole(userRole(session?.user));
  /* Role-driven rows only after hydration: the session atom is empty during SSR but may
   * already be filled on the first client render, and that difference is a hydration
   * mismatch. variant="admin" comes from the server, so it needs no gate. */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const isStaff = variant === "admin" || (hydrated && isStaffUser);

  const headingId = useId();
  const groups: readonly { key: "account" | "admin"; items: readonly SidebarItem[] }[] = isStaff
    ? [
        { key: "account", items: BASE_ITEMS },
        { key: "admin", items: ADMIN_ITEMS },
      ]
    : [{ key: "account", items: BASE_ITEMS }];
  const showHeadings = groups.length > 1;

  /* Longest match wins so /profile/bookings activates "bookings", not its /profile prefix. */
  const activeFromPath = [...HREFS]
    .filter(([, href]) => pathname === href || pathname.startsWith(`${href}/`))
    .sort(([, a], [, b]) => b.length - a.length)[0]?.[0];
  const active = activeFromPath ?? defaultActive;

  return (
    <nav
      aria-label={t("menu")}
      className={cn(
        /* Sticky from lg (where it sits beside the content): pinned 96px below the top —
           the 72px sticky navbar plus the page's 24px block padding (80px navbar at 2xl). */
        "w-full max-w-[334px] overflow-hidden rounded-lg border border-border bg-card lg:sticky lg:top-24 2xl:top-26",
        className,
      )}
    >
      {/* Header — Figma Title frame is 151px tall: greeting sits at y104 over the art, 16px sides/bottom.
          The nautical line art is the Figma Title group (845:206855) cropped to its visible
          660x151 band via viewBox; a wash fades it out under the greeting like the mock. */}
      <div className="relative px-4 pt-26 pb-4">
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: "url(/assets/illustrations/sidebar-marine.svg)" }}
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent to-card" />
        <h2 className="relative text-2xl leading-[1.3] font-bold text-foreground">
          {t("greeting", { name })}
        </h2>
      </div>

      <div className="flex flex-col py-4">
        {groups.map((group, index) => (
          <div
            key={group.key}
            /* Separated by a rule rather than spacing: the rows are full-bleed, so a gap
               reads as a rendering gap while a line reads as a boundary. */
            className={index > 0 ? "mt-2 border-t border-natural-100 pt-2" : undefined}
          >
            {showHeadings ? (
              <h3
                id={`${headingId}-${group.key}`}
                className="px-4 pt-2 pb-1 text-xs leading-[1.4] font-semibold tracking-wide text-natural-500 uppercase"
              >
                {t(`sections.${group.key}`)}
              </h3>
            ) : null}
            <ul
              aria-labelledby={showHeadings ? `${headingId}-${group.key}` : undefined}
              className="flex flex-col"
            >
              {group.items.map((item) => (
                <li key={item}>
                  <Row item={item} isActive={active === item} label={t(item)} />
                </li>
              ))}
            </ul>
          </div>
        ))}

        <button
          type="button"
          onClick={onLogout}
          className="mt-2 w-full cursor-pointer border-t border-natural-100 px-4 py-4 pt-4 text-left text-base leading-[1.4] font-medium text-error-500 outline-none transition-colors hover:bg-error-50 focus-visible:bg-error-50"
        >
          {t("logout")}
        </button>
      </div>
    </nav>
  );
}

/* Menu Item is 54px in Figma: 16px paddings around 16/1.4 text. A row with no route yet
   stays an inert button rather than a dead link, so nothing announces itself as navigation
   it cannot perform. */
function Row({ item, isActive, label }: { item: SidebarItem; isActive: boolean; label: string }) {
  const href = HREFS.get(item);
  const className = cn(
    "block w-full cursor-pointer px-4 py-4 text-left text-base leading-[1.4] outline-none transition-colors focus-visible:bg-natural-50",
    isActive
      ? "bg-brand-50 font-semibold text-brand"
      : "font-medium text-foreground hover:bg-natural-50",
  );

  if (!href) {
    return (
      <button type="button" aria-current={isActive ? "page" : undefined} className={className}>
        {label}
      </button>
    );
  }

  return (
    <Link href={href} aria-current={isActive ? "page" : undefined} className={className}>
      {label}
    </Link>
  );
}
