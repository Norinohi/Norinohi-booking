"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Bookmark, Globe, Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

import UserMenu from "./user-menu";

/*
 * NavigationBar — Figma "Navigation Bar" (nodes 728:8369 desktop / 953:208061 tablet /
 * 959:318819 mobile). Desktop (2xl, the 1536 design frame): logo (28 Bold) + 64px gap +
 * nav links, then the icon cluster (40px, 4px-radius, 24px glyphs) + neutral & brand CTAs;
 * 70px side padding. Below 2xl it collapses to the tablet/mobile design — hamburger +
 * wordmark + the three icons — and the links + CTAs move into the sheet. The full desktop
 * spacing needs ~1536px, so it switches on at 2xl rather than xl. Strings: `Nav` namespace.
 */
const NAV_LINKS: { key: string; chip?: boolean }[] = [
  { key: "destinations" },
  { key: "boatTypes" },
  { key: "findByBudget", chip: true },
  { key: "popularRoutes" },
];

export default function NavigationBar() {
  const t = useTranslations("Nav");
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-40 border-b border-natural-50 bg-background">
      <div className="flex h-[72px] items-center justify-between gap-4 px-4 md:px-6 2xl:h-20 2xl:px-[70px]">
        {/* Left group: hamburger (below 2xl) + wordmark + nav links (2xl+) */}
        <div className="flex items-center gap-4 2xl:gap-16">
          <IconButton
            variant="subtle"
            aria-label={open ? t("closeMenu") : t("openMenu")}
            className="rounded-sm 2xl:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </IconButton>

          <Link
            href="/"
            className="text-xl leading-tight font-bold text-foreground md:text-2xl 2xl:text-[28px]"
          >
            YachtCharter
          </Link>

          <nav className="hidden items-center gap-6 2xl:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.key}
                href="#"
                className="flex items-center gap-1.5 p-1 text-base font-normal whitespace-nowrap text-foreground transition-colors hover:text-brand"
              >
                {t(link.key)}
                {link.chip && (
                  <Chip variant="brand" className="rounded-full px-1.5 py-1">
                    {t("tryIt")}
                  </Chip>
                )}
              </a>
            ))}
          </nav>
        </div>

        {/* Right group: icon cluster (always) + CTAs (2xl+) */}
        <div className="flex items-center gap-1.5 2xl:gap-5">
          <div className="flex items-center gap-1.5">
            <IconButton variant="subtle" aria-label={t("saved")} className="rounded-sm">
              <Bookmark className="size-6" />
            </IconButton>
            <UserMenu />
            <IconButton variant="subtle" aria-label={t("language")} className="rounded-sm">
              <Globe className="size-6" />
            </IconButton>
          </div>

          <div className="hidden items-center gap-3 2xl:flex">
            <Button variant="neutral">{t("helpPlan")}</Button>
            <Button variant="brand">{t("findYacht")}</Button>
          </div>
        </div>
      </div>

      {/* Collapsed sheet (below 2xl) — links + CTAs from the hamburger */}
      <div
        className={cn(
          "absolute inset-x-0 top-full origin-top border-b border-natural-50 bg-background shadow-[4px_4px_10px_rgba(0,0,0,0.1)] 2xl:hidden",
          open ? "block" : "hidden",
        )}
      >
        <nav className="flex flex-col gap-1 p-4">
          {NAV_LINKS.map((link) => (
            <a
              key={link.key}
              href="#"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 rounded-lg px-2 py-3 text-base font-normal text-foreground transition-colors hover:bg-natural-50 hover:text-brand"
            >
              {t(link.key)}
              {link.chip && (
                <Chip variant="brand" className="rounded-full px-1.5 py-1">
                  {t("tryIt")}
                </Chip>
              )}
            </a>
          ))}
          <div className="mt-3 flex flex-col gap-3">
            <Button variant="neutral" className="w-full">
              {t("helpPlan")}
            </Button>
            <Button variant="brand" className="w-full">
              {t("findYacht")}
            </Button>
          </div>
        </nav>
      </div>
    </header>
  );
}
