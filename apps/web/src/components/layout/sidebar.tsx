"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { useState } from "react";

/*
 * Sidebar — Figma "Sidebar" (Reusable Sections, nodes 845:207497 User / 853:58498 Admin).
 * Account menu card: a greeting header over a soft wash, then rows with an active highlight
 * (brand-50 + brand text) and a destructive "Log Out". Admin adds "Discount Manager".
 */

const BASE_ITEMS: { key: string; label: string }[] = [
  { key: "profile", label: "My Profile" },
  { key: "bookings", label: "My Bookings" },
  { key: "referrals", label: "Referrals" },
];

const ADMIN_ITEMS: { key: string; label: string }[] = [
  { key: "discount", label: "Discount Manager" },
];

type SidebarProps = {
  name?: string;
  variant?: "user" | "admin";
  defaultActive?: string;
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
  const items = variant === "admin" ? [...BASE_ITEMS, ...ADMIN_ITEMS] : BASE_ITEMS;
  const [active, setActive] = useState(defaultActive);

  return (
    <nav
      aria-label="Account menu"
      className={cn(
        "w-full max-w-[334px] overflow-hidden rounded-lg border border-border bg-card",
        className,
      )}
    >
      {/* TODO: swap the wash for the Figma nautical line-art illustration asset. */}
      <div className="bg-gradient-to-b from-brand-50/70 to-card px-5 pt-14 pb-5">
        <h2 className="text-2xl font-bold text-foreground">Hello, {name}!</h2>
      </div>

      <ul className="flex flex-col pb-2">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              aria-current={active === item.key ? "page" : undefined}
              onClick={() => setActive(item.key)}
              className={cn(
                "w-full px-5 py-3.5 text-left text-base outline-none transition-colors focus-visible:bg-natural-50",
                active === item.key
                  ? "bg-brand-50 font-semibold text-brand"
                  : "font-medium text-foreground hover:bg-natural-50",
              )}
            >
              {item.label}
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onLogout}
            className="w-full px-5 py-3.5 text-left text-base font-medium text-error-500 outline-none transition-colors hover:bg-error-50 focus-visible:bg-error-50"
          >
            Log Out
          </button>
        </li>
      </ul>
    </nav>
  );
}
