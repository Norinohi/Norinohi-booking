"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { env } from "@yacht-charter/env/web";
import { Cookie } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";

import {
  clearAnalyticsCookies,
  consentPayload,
  onCookiePreferencesRequested,
  openCookiePreferences,
  readConsent,
  writeConsent,
  type ConsentSignals,
} from "@/lib/consent";
import { BANNER, BANNER_DURATION, BANNER_STILL, EASE } from "@/lib/motion";

import { CookiePreferencesDialog } from "./cookie-preferences-dialog";

/**
 * Narrower than the `gtag` the bootstrap script defines, and deliberately so: the only
 * call this component makes is a consent update, and a vararg signature would type-check
 * every typo in it.
 */
type ConsentUpdate = (command: "consent", action: "update", signals: ConsentSignals) => void;

declare global {
  interface Window {
    gtag?: ConsentUpdate;
  }
}

/**
 * Rendered only where a GA id is configured (see the root layout), so on staging and in
 * development there is no banner — there is also nothing to consent to.
 */
export function CookieConsent() {
  const t = useTranslations("Layout.CookieConsent");
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  const [asking, setAsking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  /*
   * `localStorage` cannot be read during render without the server and client disagreeing
   * on the first paint, so the banner starts hidden and appears once the stored answer is
   * known to be absent. The cost is that it fades in a beat late; the alternative is a
   * hydration mismatch on every page of the site.
   */
  useEffect(() => {
    const stored = readConsent();
    if (stored) setAnalytics(stored.analytics);
    else setAsking(true);
  }, []);

  /* The footer control reaches this component through a window event rather than a
     provider: the footer is a Server Component and stays one. */
  useEffect(() => onCookiePreferencesRequested(() => setDialogOpen(true)), []);

  const applyConsent = useCallback((allowAnalytics: boolean) => {
    /*
     * Order matters on withdrawal. The update stops new writes; clearing removes what an
     * earlier `granted` already left behind, which the tag never does on its own.
     */
    writeConsent(allowAnalytics);
    window.gtag?.("consent", "update", consentPayload(allowAnalytics));
    if (!allowAnalytics) clearAnalyticsCookies();

    setAnalytics(allowAnalytics);
    setAsking(false);
    setDialogOpen(false);
  }, []);

  /*
   * The consent update fires on click, not on the banner's exit animation: the choice has
   * to reach gtag whether or not the animation ever completes. A backgrounded tab starves
   * rAF, so an exit that gated the update would strand it.
   */
  return (
    <>
      <AnimatePresence>
        {asking ? (
          <motion.section
            key="cookie-consent"
            aria-labelledby={titleId}
            variants={reduceMotion ? BANNER_STILL : BANNER}
            initial="hidden"
            animate="show"
            exit="hidden"
            transition={{ duration: BANNER_DURATION, ease: EASE }}
            className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 md:px-6 md:pb-6"
          >
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-[4px_4px_15px_rgba(0,0,0,0.03)] md:flex-row md:items-center md:gap-6 md:p-6">
              <div className="flex flex-1 items-start gap-4">
                <span
                  aria-hidden
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand"
                >
                  <Cookie className="size-5" />
                </span>
                <div className="flex flex-col gap-1">
                  <p id={titleId} className="text-base font-semibold text-foreground">
                    {t("title")}
                  </p>
                  <p className="text-sm text-natural-600">
                    {t("description")}{" "}
                    <button
                      type="button"
                      onClick={() => setDialogOpen(true)}
                      className="cursor-pointer text-brand underline underline-offset-4 transition-colors hover:text-brand-hover"
                    >
                      {t("manage")}
                    </button>
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 gap-3 max-md:flex-col-reverse">
                <Button variant="neutral" size="sm" onClick={() => applyConsent(false)}>
                  {t("decline")}
                </Button>
                <Button variant="brand" size="sm" onClick={() => applyConsent(true)}>
                  {t("accept")}
                </Button>
              </div>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <CookiePreferencesDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialAnalytics={analytics}
        onSave={applyConsent}
      />
    </>
  );
}

/**
 * Footer control that reopens the dialog. Withdrawing consent has to be as easy as giving
 * it, and the banner is gone once answered — without this there is no way back.
 *
 * Renders nothing where no GA id is configured, matching the banner: with no tag there is
 * nothing to manage.
 */
export function CookiePreferencesLink({ className }: { className?: string }) {
  const t = useTranslations("Layout.CookieConsent");

  if (!env.NEXT_PUBLIC_GA_ID) return null;

  return (
    <button type="button" onClick={openCookiePreferences} className={className}>
      {t("footerLink")}
    </button>
  );
}
