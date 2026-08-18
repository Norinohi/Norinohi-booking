"use client";

import { buttonVariants } from "@yacht-charter/ui/components/actions/button";
import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Bookmark, Menu, X } from "lucide-react";
import { motion, useAnimationControls } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useEffect, useState } from "react";

import { useWishlist } from "@/features/wishlist";

import LanguageSwitcher from "./language-switcher";
import UserMenu from "./user-menu";

const NAV_LINKS = [
  { key: "destinations", hash: "destinations", chip: false },
  { key: "boatTypes", hash: "boat-types", chip: false },
  { key: "findByBudget", hash: "find-by-budget", chip: true },
  { key: "popularRoutes", hash: "popular-routes", chip: false },
] as const;

const PLAN_MY_TRIP_HREF = "/plan-my-trip";
const WISHLIST_HREF = "/wishlist";

export default function NavigationBar() {
  const t = useTranslations("Layout.Nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const onWishlist = pathname === WISHLIST_HREF;

  const { savedCount, addSignal, isReady } = useWishlist();
  const bump = useAnimationControls();
  const flash = useAnimationControls();

  // Each add plays a pop plus a gold fill over the bookmark, so the header confirms the save even
  // when the button that triggered it sits far down the page. The fill appears fast, holds, then
  // fades out. MotionConfig drops the scale for prefers-reduced-motion users; the opacity fade and
  // the count badge still update.
  useEffect(() => {
    if (addSignal === 0) return;
    void bump.start({
      scale: [1, 1.3, 0.92, 1],
      transition: { duration: 0.45, ease: "easeOut", times: [0, 0.4, 0.7, 1] },
    });
    void flash.start({
      opacity: [0, 1, 1, 0],
      transition: { duration: 1.4, ease: "easeInOut", times: [0, 0.1, 0.5, 1] },
    });
  }, [addSignal, bump, flash]);

  return (
    <header className="sticky top-0 z-40 border-b border-natural-50 bg-background">
      <div className="mx-auto flex h-18 max-w-[1536px] items-center justify-between gap-4 px-4 md:px-13.5 2xl:h-20 2xl:px-17.5">
        {/* Left group: hamburger (below 2xl) + wordmark + nav links (2xl+) */}
        <div className="flex items-center gap-4 2xl:gap-16">
          <IconButton
            variant="subtle"
            aria-label={open ? t("closeMenu") : t("openMenu")}
            className="rounded-sm min-[1360px]:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-6" /> : <Menu className="size-6" />}
          </IconButton>

          <Link
            href="/"
            className="cursor-pointer text-xl leading-tight font-bold text-foreground md:text-[28px] 2xl:text-[28px]"
          >
            YachtSkanner
          </Link>

          <nav className="hidden items-center gap-6 min-[1360px]:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.key}
                href={{ pathname: "/", hash: link.hash }}
                className="flex cursor-pointer items-center gap-1.5 p-1 text-base font-normal whitespace-nowrap text-foreground transition-colors hover:text-brand"
              >
                {t(link.key)}
                {link.chip && (
                  <Chip variant="brand" className="rounded-full px-1.5 py-1">
                    {t("tryIt")}
                  </Chip>
                )}
              </Link>
            ))}
          </nav>
        </div>

        {/* Right group: icon cluster (always) + CTAs (2xl+) */}
        <div className="flex items-center gap-1.5 2xl:gap-5">
          <div className="flex items-center gap-1.5">
            <motion.div animate={bump} className="relative inline-flex">
              <IconButton
                variant="subtle"
                nativeButton={false}
                render={<Link href={WISHLIST_HREF} />}
                aria-label={t("saved")}
                aria-current={onWishlist ? "page" : undefined}
                className={cn("rounded-sm", onWishlist && "text-brand hover:bg-brand-50")}
              >
                <Bookmark className={cn("size-6", onWishlist && "fill-current")} />
              </IconButton>
              <motion.span
                aria-hidden
                initial={{ opacity: 0 }}
                animate={flash}
                className="pointer-events-none absolute inset-0 flex items-center justify-center"
              >
                <Bookmark className="size-6 fill-gold text-gold" />
              </motion.span>
              {isReady && savedCount > 0 && (
                <motion.span
                  key={savedCount}
                  aria-hidden
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 24 }}
                  className="pointer-events-none absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border border-background bg-brand px-1 text-xs font-semibold text-brand-foreground"
                >
                  {savedCount > 99 ? "99+" : savedCount}
                </motion.span>
              )}
            </motion.div>
            <UserMenu />
            <LanguageSwitcher />
          </div>

          <div className="hidden items-center gap-3 min-[1360px]:flex">
            <Link href={PLAN_MY_TRIP_HREF} className={buttonVariants({ variant: "neutral" })}>
              {t("helpPlan")}
            </Link>
            <Link href="/yachts" className={buttonVariants({ variant: "brand" })}>
              {t("findYacht")}
            </Link>
          </div>
        </div>
      </div>

      {/* Collapsed sheet (below 2xl) — links + CTAs from the hamburger */}
      <div
        className={cn(
          "absolute inset-x-0 top-full origin-top border-b border-natural-50 bg-background shadow-[4px_4px_10px_rgba(0,0,0,0.1)] min-[1360px]:hidden",
          open ? "block" : "hidden",
        )}
      >
        <nav className="flex flex-col gap-1 p-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.key}
              href={{ pathname: "/", hash: link.hash }}
              onClick={() => setOpen(false)}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-3 text-base font-normal text-foreground transition-colors hover:bg-natural-50 hover:text-brand"
            >
              {t(link.key)}
              {link.chip && (
                <Chip variant="brand" className="rounded-full px-1.5 py-1">
                  {t("tryIt")}
                </Chip>
              )}
            </Link>
          ))}
          <div className="mt-3 flex flex-col gap-3">
            <Link
              href={PLAN_MY_TRIP_HREF}
              onClick={() => setOpen(false)}
              className={buttonVariants({ variant: "neutral", className: "w-full" })}
            >
              {t("helpPlan")}
            </Link>
            <Link
              href="/yachts"
              onClick={() => setOpen(false)}
              className={buttonVariants({ variant: "brand", className: "w-full" })}
            >
              {t("findYacht")}
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
