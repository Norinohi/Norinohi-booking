"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

type Unit = "day" | "hour" | "minute" | "second";

/*
 * Two units at a time, the larger ones dropped as they run out: "2 days 5 hr" says as much as a
 * visitor can use a week out, and seconds only earn their place in the last hour.
 */
function remainingParts(ms: number): [Unit, number][] {
  if (ms >= DAY) {
    return [
      ["day", Math.floor(ms / DAY)],
      ["hour", Math.floor((ms % DAY) / HOUR)],
    ];
  }
  if (ms >= HOUR) {
    return [
      ["hour", Math.floor(ms / HOUR)],
      ["minute", Math.floor((ms % HOUR) / MINUTE)],
    ];
  }
  return [
    ["minute", Math.floor(ms / MINUTE)],
    ["second", Math.floor((ms % MINUTE) / SECOND)],
  ];
}

export interface HoldCountdownProps {
  expiresAt: string | null;
  className?: string;
}

/**
 * How long another customer's temporary booking over this week has left.
 *
 * The deadline is the vendor's as of the last availability sync, so reaching zero does not
 * make the week bookable: the option may have been confirmed or extended since, and the card
 * says the hold is ending rather than that the boat is free.
 *
 * The clock starts after mount. The page is prerendered, and a time computed there would be
 * stale by the time it is read and would disagree with the client's first render.
 */
export default function HoldCountdown({ expiresAt, className }: HoldCountdownProps) {
  const t = useTranslations("Common.boatCard");
  const format = useFormatter();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (expiresAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), SECOND);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const text = (() => {
    if (expiresAt === null) return t("holdNoDeadline");
    if (now === null) return t("holdEndsIn", { time: "…" });
    const remaining = Date.parse(expiresAt) - now;
    if (remaining <= 0) return t("holdEnding");
    const time = remainingParts(remaining)
      .map(([unit, value]) => format.number(value, { style: "unit", unit, unitDisplay: "short" }))
      .join(" ");
    return t("holdEndsIn", { time });
  })();

  return (
    <p className={cn("text-sm leading-[1.3] text-gold tabular-nums", className)}>
      {expiresAt === null ? text : <time dateTime={expiresAt}>{text}</time>}
    </p>
  );
}
