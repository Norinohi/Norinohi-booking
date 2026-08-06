"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname } from "next/navigation";

/*
 * Sidebar — Figma "Sidebar" (Reusable Sections, nodes 845:207497 User / 853:58498 Admin).
 * Account menu card: a greeting header over a soft wash, then rows with an active highlight
 * (brand-50 + brand text) and a destructive "Log Out". Admin adds "Discount Manager".
 * Rows with a route render as links and read their active state from the pathname; rows whose
 * page doesn't exist yet stay as inert buttons highlighted only by `defaultActive`.
 */

const BASE_ITEMS = ["profile", "bookings", "referrals"] as const;

const ADMIN_ITEMS = ["discount"] as const;

type SidebarItem = (typeof BASE_ITEMS)[number] | (typeof ADMIN_ITEMS)[number];

/* Only wired pages get an href; the rest stay inert until their routes exist. */
const HREFS: Partial<Record<SidebarItem, Route>> = {
  profile: "/profile",
  bookings: "/profile/bookings",
  referrals: "/profile/referrals",
};

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
  const items: readonly SidebarItem[] =
    variant === "admin" ? [...BASE_ITEMS, ...ADMIN_ITEMS] : BASE_ITEMS;

  /* Longest match wins so /profile/bookings activates "bookings", not its /profile prefix. */
  const activeFromPath = (Object.entries(HREFS) as [SidebarItem, string][])
    .filter(([, href]) => pathname === href || pathname.startsWith(`${href}/`))
    .sort(([, a], [, b]) => b.length - a.length)[0]?.[0];
  const active = activeFromPath ?? defaultActive;

  return (
    <nav
      aria-label={t("menu")}
      className={cn(
        "w-full max-w-[334px] overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {/* TODO: swap the wash for the Figma nautical line-art illustration asset. */}
      {/* Header — Figma Title frame is 151px tall: greeting sits at y104 over the art, 16px sides/bottom */}
      <div className="bg-gradient-to-b from-brand-50/70 to-card px-4 pt-26 pb-4">
        <h2 className="text-2xl leading-[1.3] font-bold text-foreground">
          {t("greeting", { name })}
        </h2>
      </div>

      <ul className="flex flex-col py-4">
        {items.map((item) => {
          const href = HREFS[item];
          const isActive = active === item;
          /* Menu Item is 54px in Figma: 16px paddings around 16/1.4 text */
          const rowClassName = cn(
            "block w-full px-4 py-4 text-left text-base leading-[1.4] outline-none transition-colors focus-visible:bg-natural-50",
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
            className="w-full px-4 py-4 text-left text-base leading-[1.4] font-medium text-error-500 outline-none transition-colors hover:bg-error-50 focus-visible:bg-error-50"
          >
            {t("logout")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
