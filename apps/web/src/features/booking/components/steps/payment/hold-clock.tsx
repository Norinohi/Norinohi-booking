"use client";

import { Notification } from "@yacht-charter/ui/components/feedback/notification";
import { Clock, TriangleAlert } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Link } from "@/i18n/navigation";

import { type HoldRemaining, holdRemaining } from "../../../lib/hold-clock";

const TICK_MS = 15_000;

/**
 * The live state of the provider option, or null while there is no option or no clock yet.
 *
 * The clock starts after mount: a "now" taken during render would differ between the server and
 * the client's first render, and the countdown is worthless until the browser owns it anyway.
 */
export function useHoldRemaining(expiresAt: string | null): HoldRemaining | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (expiresAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [expiresAt]);

  return expiresAt === null || now === null ? null : holdRemaining(expiresAt, now);
}

/*
 * A deadline is a real instant, unlike a charter day, so it is shown in the visitor's own zone
 * with the zone named, rather than in the UTC the app formats calendar days in. Safe to read the
 * browser's zone here: the notice only renders once the clock has started after mount.
 */
function holdFormat() {
  return {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  } as const;
}

export interface HoldNoticeProps {
  expiresAt: string;
  remaining: HoldRemaining;
}

/** "Held until 19 Sep, 21:44 (47 h 12 min left)", or why payment is closed once it is not. */
export function HoldNotice({ expiresAt, remaining }: HoldNoticeProps) {
  const t = useTranslations("Booking.payment.hold");
  const format = useFormatter();
  const until = format.dateTime(new Date(expiresAt), holdFormat());

  if (remaining.expired) {
    return (
      <Notification variant="warning" icon={<TriangleAlert />}>
        <span className="flex flex-col gap-2">
          <span className="font-bold">{t("expiredTitle")}</span>
          <span>{t("expiredBody", { until })}</span>
        </span>
      </Notification>
    );
  }

  const unit = (value: number, name: "hour" | "minute") =>
    format.number(value, { style: "unit", unit: name, unitDisplay: "short" });
  const left = `${unit(remaining.hours, "hour")} ${unit(remaining.minutes, "minute")}`;

  return (
    <Notification icon={<Clock />}>
      <time dateTime={expiresAt} className="tabular-nums">
        {t("until", { until, left })}
      </time>
    </Notification>
  );
}

export interface HoldExpiredLinkProps {
  slug: string;
}

export function HoldExpiredLink({ slug }: HoldExpiredLinkProps) {
  const t = useTranslations("Booking.payment.hold");
  return (
    <Link href={`/yachts/${slug}`} className="text-sm font-semibold text-brand underline">
      {t("backToYacht")}
    </Link>
  );
}
