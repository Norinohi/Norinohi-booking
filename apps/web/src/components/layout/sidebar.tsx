"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import type { AppPathname } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useEffect, useState } from "react";

import { authClient, isStaffRole, userRole } from "@/lib/auth-client";

/*
 * Sidebar — Figma "Sidebar" (Reusable Sections, nodes 845:207497 User / 853:58498 Admin).
 * Account menu card: a greeting header over a soft wash, then rows with an active highlight
 * (brand-50 + brand text) and a destructive "Log Out". Admin adds "Inbox", "Payments",
 * "Discount Manager", "Duplicate Review" and "Sync History".
 * Rows with a route render as links and read their active state from the pathname; rows whose
 * page doesn't exist yet stay as inert buttons highlighted only by `defaultActive`.
 */

const BASE_ITEMS = ["profile", "bookings", "referrals"] as const;

const ADMIN_ITEMS = ["inbox", "payments", "discount", "duplicates", "sync"] as const;

type SidebarItem = (typeof BASE_ITEMS)[number] | (typeof ADMIN_ITEMS)[number];

/* Only wired pages get an href; the rest stay inert until their routes exist. */
const HREFS = new Map<SidebarItem, AppPathname>([
  ["profile", "/profile"],
  ["bookings", "/profile/bookings"],
  ["referrals", "/profile/referrals"],
  ["discount", "/profile/discounts"],
  /* The (admin) route group is URL-invisible, so these sit at the root, not under /profile. */
  ["inbox", "/inbox"],
  ["payments", "/payments"],
  ["duplicates", "/duplicates"],
  ["sync", "/sync"],
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
  const items: readonly SidebarItem[] = isStaff ? [...BASE_ITEMS, ...ADMIN_ITEMS] : BASE_ITEMS;

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

      <ul className="flex flex-col py-4">
        {items.map((item) => {
          const href = HREFS.get(item);
          const isActive = active === item;
          /* Menu Item is 54px in Figma: 16px paddings around 16/1.4 text */
          const rowClassName = cn(
            "block w-full cursor-pointer px-4 py-4 text-left text-base leading-[1.4] outline-none transition-colors focus-visible:bg-natural-50",
            isActive
              ? "bg-brand-50 font-semibold text-brand"
              : "font-medium text-foreground hover:bg-natural-50",
          );

          return (
            <li key={item}>
              {href ? (
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={rowClassName}
                >
                  {t(item)}
                </Link>
              ) : (
                <button
                  type="button"
                  aria-current={isActive ? "page" : undefined}
                  className={rowClassName}
                >
                  {t(item)}
                </button>
              )}
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={onLogout}
            className="w-full cursor-pointer px-4 py-4 text-left text-base leading-[1.4] font-medium text-error-500 outline-none transition-colors hover:bg-error-50 focus-visible:bg-error-50"
          >
            {t("logout")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
