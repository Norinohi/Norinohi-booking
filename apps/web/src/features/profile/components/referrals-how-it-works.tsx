"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { Slider } from "@yacht-charter/ui/components/form/slider";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";

import { REFERRAL_LEVEL } from "../lib/referrals";

/** Step keys under `Referrals.how.steps`, in timeline order. */
const STEPS = ["share", "book", "credit"] as const;

/*
 * ReferralsHowItWorks — the "How It Works" stepper + "Your Level" card of /profile/referrals.
 * Figma "My Referrals" section 2: 972:54944 (desktop, inside 972:54801; stepper 972:54946,
 * level card 972:54975) / 973:88651 (tablet) / 973:88718 (mobile).
 * Two equal columns with a 32px gap on desktop; the tablet/mobile frames stack them (stepper
 * first) with the same 32px gap, so the split only applies at xl where each half gets enough
 * width. Both the timeline rail/markers and the level progress reuse the Slider visual
 * language (12px brand-50/50 rail, brand fill, 16px white thumb ringed 2px brand).
 */
export default function ReferralsHowItWorks() {
  const t = useTranslations("Referrals");

  return (
    <div className="grid items-start gap-8 xl:grid-cols-2">
      {/* Left — 3-step timeline (972:54946) */}
      <div className="flex flex-col gap-4">
        <h3 className="text-body-m-bold text-natural-700">{t("how.title")}</h3>

        <div className="relative flex flex-col gap-[42px]">
          {/* Vertical rail behind the markers — Figma vertical slider track (972:54949) */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0.5 w-3 rounded-full bg-brand-50/50"
          />
          {STEPS.map((step) => (
            <div key={step} className="flex items-start gap-4">
              {/* Step marker — 16px slider-thumb: white disc, 2px brand ring, centered on the title line */}
              <span
                aria-hidden
                className="relative mt-1 size-4 shrink-0 rounded-full border-2 border-brand bg-white md:mt-[5px]"
              />
              <div className="flex min-w-0 flex-col gap-1.5">
                <h4 className="text-h6 text-foreground">{t(`how.steps.${step}.title`)}</h4>
                <p className="text-body-m text-foreground">{t(`how.steps.${step}.description`)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right — "Your Level" card (972:54975) */}
      <div className="flex flex-col gap-3 rounded-2xl bg-brand-50 p-4">
        <h3 className="text-body-m-bold text-natural-700">{t("how.level.title")}</h3>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-body-caption-s text-foreground">{t("how.level.current")}</span>
              <span className="text-h6 text-foreground">{REFERRAL_LEVEL.current}</span>
            </div>
            <span className="text-input-tag text-natural-600">
              {t("how.level.next", { level: REFERRAL_LEVEL.next })}
            </span>
          </div>

          {/* Progress toward the next level — display-only, full-bleed rail per Figma */}
          <Slider
            value={REFERRAL_LEVEL.progress}
            disabled
            controlClassName="px-0"
            className="pointer-events-none"
          />

          <p className="text-input-tag text-natural-600">
            {t("how.level.left", { count: REFERRAL_LEVEL.bookingsLeft })}
          </p>
        </div>

        <ul className="flex flex-col">
          {REFERRAL_LEVEL.perks.map((perk) => (
            <li key={perk.key} className="flex items-center gap-2 py-2">
              {/* Display-only checkbox: controlled with no handler, out of tab order */}
              <Checkbox
                checked={perk.unlocked}
                tabIndex={-1}
                className="pointer-events-none cursor-default"
                aria-label={t(`how.level.perks.${perk.key}`)}
              />
              <span className={cn("text-body-s text-foreground", perk.unlocked && "line-through")}>
                {t(`how.level.perks.${perk.key}`)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
