"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Cookie } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import {
  consentPayload,
  readConsent,
  writeConsent,
  type ConsentSignals,
  type ConsentState,
} from "@/lib/consent";
import { BANNER, BANNER_DURATION, BANNER_STILL, EASE } from "@/lib/motion";

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

  /*
   * `localStorage` cannot be read during render without the server and client disagreeing
   * on the first paint, so the banner starts hidden and appears once the stored answer is
   * known to be absent. The cost is that it fades in a beat late; the alternative is a
   * hydration mismatch on every page of the site.
   */
  useEffect(() => {
    if (!readConsent()) setAsking(true);
  }, []);

  function applyConsent(state: ConsentState) {
    writeConsent(state);
    window.gtag?.("consent", "update", consentPayload(state));
    setAsking(false);
  }

  /*
   * The consent update above fires on click, not on exit: the choice has to reach gtag whether
   * or not the animation ever completes. A backgrounded tab starves rAF, so an exit that gated
   * the update would strand it.
   */
  return (
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
                <p className="text-sm text-natural-600">{t("description")}</p>
              </div>
            </div>

            <div className="flex shrink-0 gap-3 max-md:flex-col-reverse">
              <Button variant="neutral" size="sm" onClick={() => applyConsent("denied")}>
                {t("decline")}
              </Button>
              <Button variant="brand" size="sm" onClick={() => applyConsent("granted")}>
                {t("accept")}
              </Button>
            </div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
