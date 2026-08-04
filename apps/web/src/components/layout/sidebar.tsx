"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useState } from "react";

/*
 * Sidebar — Figma "Sidebar" (Reusable Sections, nodes 845:207497 User / 853:58498 Admin).
 * Account menu card: a greeting header over a soft wash, then rows with an active highlight
 * (brand-50 + brand text) and a destructive "Log Out". Admin adds "Discount Manager".
 */

const BASE_ITEMS = ["profile", "bookings", "referrals"] as const;

const ADMIN_ITEMS = ["discount"] as const;

type SidebarItem = (typeof BASE_ITEMS)[number] | (typeof ADMIN_ITEMS)[number];

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
  const items: readonly SidebarItem[] =
    variant === "admin" ? [...BASE_ITEMS, ...ADMIN_ITEMS] : BASE_ITEMS;
  const [active, setActive] = useState(defaultActive);

  return (
    <nav
      aria-label={t("menu")}
      className={cn(
        "w-full max-w-[334px] overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {/* TODO: swap the wash for the Figma nautical line-art illustration asset. */}
      <div className="bg-gradient-to-b from-brand-50/70 to-card px-5 pt-14 pb-5">
        <h2 className="text-2xl font-bold text-foreground">{t("greeting", { name })}</h2>
      </div>

      <ul className="flex flex-col pb-2">
        {items.map((item) => (
          <li key={item}>
            <button
              type="button"
              aria-current={active === item ? "page" : undefined}
              onClick={() => setActive(item)}
              className={cn(
                "w-full px-5 py-3.5 text-left text-base outline-none transition-colors focus-visible:bg-natural-50",
                active === item
                  ? "bg-brand-50 font-semibold text-brand"
                  : "font-medium text-foreground hover:bg-natural-50",
              )}
            >
              {t(item)}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onLogout}
            className="w-full px-5 py-3.5 text-left text-base font-medium text-error-500 outline-none transition-colors hover:bg-error-50 focus-visible:bg-error-50"
          >
            {t("logout")}
          </button>
        </li>
      </ul>
    </nav>
  );
}
