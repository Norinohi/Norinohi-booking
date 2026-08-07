"use client";

import { env } from "@yacht-charter/env/web";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { CircleCheck, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useMoney } from "@/hooks/use-money";

import illustration from "../assets/referral-invite.png";
import { useReferralSummary, useRotateReferralCode } from "../hooks/use-referrals";

/*
 * ReferralsInvite — the invite hero of /profile/referrals.
 * Figma "My Referrals" section 1: 972:54815 (desktop, inner panel 972:54829) /
 * 973:88651 (tablet) / 973:88718 (mobile).
 * A brand-50 rounded-2xl panel (p-8 desktop/tablet, p-4 mobile, 16px block gap):
 * heading (h4 32 Medium / 24 SemiBold mobile) + body-xl description, the referral
 * link in a 48px TextField with a copy affordance next to a 200px brand button
 * (stacked full-width on mobile), an "Information" checklist (20px brand
 * CircleCheck + body-s rows), and four stat tiles (32 Bold brand value over a
 * dotted-underlined caption) — bottom-right on desktop, an in-flow row on tablet,
 * a 2x2 column-flow grid on mobile. The gift illustration is clipped into the
 * top-right corner; the PNG is pre-cropped to the desktop overflow (233x199.5 of
 * the 283x209 group, top 10px / right 50px removed), hence the breakpoint offsets.
 */

const RULE_KEYS = ["minBooking", "expiry", "cash", "firstTime"] as const;

/** Stat tiles, in Figma order. Each key resolves under `Referrals.invite.stats`. */
const STAT_KEYS = ["invited", "completed", "earned", "balance"] as const;

export default function ReferralsInvite() {
  const t = useTranslations("Referrals");
  const formatMoney = useMoney();

  /* referral.summary returns a path (/register?ref=CODE); the app origin makes it shareable. */
  const { data: summary } = useReferralSummary();
  const rotate = useRotateReferralCode();

  const referralUrl = summary ? new URL(summary.urlPath, env.NEXT_PUBLIC_APP_URL) : undefined;
  const displayLink = referralUrl
    ? `${referralUrl.host}${referralUrl.pathname}${referralUrl.search}`
    : "";

  /* Values stay null until the summary lands, so each tile keeps its slot and skeletons in place. */
  const stats: { label: (typeof STAT_KEYS)[number]; value: string | null }[] = [
    { label: "invited", value: summary ? String(summary.invitedCount) : null },
    { label: "completed", value: summary ? String(summary.completedBookingsCount) : null },
    { label: "earned", value: summary ? formatMoney(summary.totalEarned.amountMinor) : null },
    { label: "balance", value: summary ? formatMoney(summary.availableBalance.amountMinor) : null },
  ];

  const copyLink = () => {
    if (!referralUrl) {
      return;
    }
    void navigator.clipboard
      .writeText(referralUrl.href)
      .then(() => toast.success(t("invite.copied")));
  };

  const generateCode = () => {
    rotate.mutate(
      {},
      {
        onSuccess: () => toast.success(t("invite.generated")),
        onError: () => toast.error(t("invite.generateFailed")),
      },
    );
  };

  return (
    <div className="relative flex w-full flex-col items-start gap-4 overflow-hidden rounded-2xl bg-brand-50 p-4 md:p-8">
      {/* Illustration — group sits at x769/y-10 of the 1002px panel (tablet x394/y-33, mobile x191/y8 at 0.639 scale) */}
      <img
        src={illustration.src}
        alt=""
        className="pointer-events-none absolute top-[14px] right-[-14px] w-[149px] max-w-none select-none md:top-[-23px] md:right-[-7px] md:w-[233px] lg:top-0 lg:right-0"
      />

      {/* Heading 972:54830 — 586px on desktop, 330px + 32px top offset on tablet, 185px on mobile */}
      <div className="relative flex w-full max-w-[185px] flex-col gap-3 text-foreground md:mt-8 md:max-w-[330px] lg:mt-0 lg:max-w-[586px]">
        <h3 className="text-2xl leading-[1.1] font-semibold md:text-[32px] md:font-medium">
          {t("invite.heading")}
        </h3>
        <p className="text-body-xl">{t("invite.description")}</p>
      </div>

      {/* Link + generate 972:54833 — 48px field flexes beside a 200px brand button, stacked on mobile */}
      <div className="relative flex w-full flex-col gap-3 md:flex-row md:items-start lg:max-w-[586px]">
        <TextField
          readOnly
          value={displayLink}
          fieldClassName="h-12 bg-card"
          endIcon={
            <button
              type="button"
              aria-label={t("invite.copy")}
              onClick={copyLink}
              disabled={!referralUrl}
              className="cursor-pointer rounded-sm text-foreground outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-50"
            >
              <Copy />
            </button>
          }
        />
        <Button
          variant="brand"
          size="md"
          className="w-full shrink-0 md:w-[200px]"
          onClick={generateCode}
          disabled={!summary || rotate.isPending}
        >
          {t("invite.generate")}
        </Button>
      </div>

      {/* Information 972:54839 — bold 16 label, 12px gap, py-2 rows of 20px brand check + body-s text */}
      <div className="relative flex w-full flex-col gap-3">
        <p className="text-body-m-bold text-foreground">{t("invite.information")}</p>
        <ul className="flex w-full flex-col">
          {RULE_KEYS.map((rule) => (
            <li key={rule} className="flex items-center gap-2 py-2">
              <CircleCheck className="size-5 shrink-0 self-start text-brand" />
              <span className="text-body-s text-foreground">{t(`invite.rules.${rule}`)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Stats 972:54816 — 2x2 grid on mobile, 24px-gap row on tablet, pinned bottom-right at the 1536 layout */}
      <div className="relative grid w-full auto-cols-fr grid-flow-col grid-rows-2 gap-1 md:flex md:flex-wrap md:items-start md:gap-6 2xl:absolute 2xl:right-[59px] 2xl:bottom-7 2xl:w-auto">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-start gap-1 p-1 drop-shadow-[4px_4px_10px_rgba(0,0,0,0.1)]"
          >
            {stat.value === null ? (
              <Skeleton className="h-9 w-16 rounded-sm" />
            ) : (
              <span className="text-[32px] leading-[1.1] font-bold text-brand">{stat.value}</span>
            )}
            <span className="text-body-caption-s text-foreground underline decoration-dotted [text-decoration-skip-ink:none]">
              {t(`invite.stats.${stat.label}`)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
