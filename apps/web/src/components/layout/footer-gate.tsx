"use client";

import type { ReactNode } from "react";

import { usePathname } from "@/i18n/navigation";

/*
 * Routes whose own layout is full-bleed chrome without the global footer: the auth screens, the
 * trip planner, and the full-screen map.
 *
 * Keyed off the current pathname, NOT a CSS sibling selector on the route's wrapper. After a soft
 * navigation Next keeps the previous route's DOM mounted-but-hidden (React Activity sets
 * `display:none !important` on it) so the back button is instant — but a `[&~footer]:hidden` rule on
 * that lingering wrapper keeps matching `~ footer` and hides the footer on the page you navigated
 * TO. `usePathname` always reflects the route actually shown, so the footer follows the real route.
 */
const FOOTERLESS = ["/login", "/register", "/plan-my-trip", "/yachts/map"];

export function FooterGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hidden = FOOTERLESS.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  return hidden ? null : children;
}
