"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { FileText, Share2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useQueryStates } from "nuqs";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";

import { Image } from "@/components/shared/data-display/image";
import EmptyState from "@/components/shared/feedback/empty-state";
import Loader from "@/components/shared/feedback/loader";
import { useMoney } from "@/hooks/use-money";
import { GROUP, POP, RISE } from "@/lib/motion";
import { client } from "@/utils/orpc";

import { bookingDetailQueryOptions, checkoutStatusQueryOptions } from "../api/queries";
import { hasFailed, isSettling } from "../lib/checkout-status";
import { guestAccessFor } from "../lib/guest-access";
import { confirmationParsers } from "../lib/search-params";

const CREW_KEYS = ["bareboat", "skipper", "full-crew"] as const;
const POLL_INTERVAL_MS = 2000;
/*
 * Stop asking after a minute. Past that the webhook is stuck or the provider is not answering,
 * and neither resolves by us polling harder — the screen says the confirmation will be emailed.
 */
const POLL_LIMIT_MS = 60_000;
const CONFETTI_COLORS = ["#2f80ed", "#eab308", "#ec4899", "#22c55e", "#a855f7", "#f97316"];

function noise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

const CONFETTI = Array.from({ length: 48 }, (_, i) => ({
  left: noise(i + 1) * 100,
  size: 6 + noise(i + 2) * 6,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: 0.2 + noise(i + 3) * 0.35,
  duration: 2.2 + noise(i + 4) * 1.4,
  drift: (noise(i + 5) - 0.5) * 140,
  spin: noise(i + 6) * 720 - 360,
  round: noise(i + 7) > 0.5,
}));

function Confetti() {
  const reduced = useReducedMotion();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {CONFETTI.map((piece, i) => (
        <motion.span
          key={i}
          className={cn("absolute top-0 block", piece.round && "rounded-full")}
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 1.6,
            backgroundColor: piece.color,
          }}
          initial={{ y: -40, x: 0, rotate: 0, opacity: 0 }}
          animate={
            reduced
              ? { opacity: 0 }
              : { y: 1200, x: piece.drift, rotate: piece.spin, opacity: [0, 1, 1, 0] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: piece.duration,
                  delay: piece.delay,
                  ease: "easeIn",
                  opacity: {
                    duration: piece.duration,
                    delay: piece.delay,
                    times: [0, 0.08, 0.7, 1],
                  },
                }
          }
        />
      ))}
    </div>
  );
}

type SummaryRow = { label: string; value: string; note?: string; emphasis?: "bold" | "strong" };

function Row({ row, last }: { row: SummaryRow; last: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-4 py-3 md:gap-10 md:py-2.75",
        last || "border-b border-dashed border-border",
      )}
    >
      <dt className="min-w-0 flex-1 text-base leading-[1.4] font-bold text-foreground">
        {row.label}
      </dt>
      <dd
        className={cn(
          "flex min-w-0 flex-1 gap-2",
          row.emphasis === "strong"
            ? "flex-col items-start md:flex-row md:items-center"
            : "items-center",
        )}
      >
        {row.emphasis === "strong" ? (
          <>
            <span className="text-xl leading-[1.3] font-bold text-foreground">{row.value}</span>
            {row.note ? (
              <span className="text-sm leading-[1.3] font-medium text-natural-500">{row.note}</span>
            ) : null}
          </>
        ) : (
          <span
            className={cn(
              "text-base leading-[1.4]",
              row.emphasis === "bold" ? "font-bold text-foreground" : "text-natural-600",
            )}
          >
            {row.value}
          </span>
        )}
      </dd>
    </div>
  );
}

export default function BookingConfirmationScreen() {
  const t = useTranslations("Booking.confirmation");
  const tCrew = useTranslations("Common.crewTypes");
  const locale = useLocale();
  const money = useMoney();
  const format = useFormatter();
  const [{ bookingId, method }] = useQueryStates(confirmationParsers);
  const [downloading, setDownloading] = useState(false);
  /*
   * Resolved on the client only — localStorage does not exist during prerender — and the
   * read has to land before the query runs, or a guest's first request goes out unauthorised.
   * `null` is "not looked yet"; a guest who set a password since has no token and needs none.
   */
  const [access, setAccess] = useState<{ token: string | undefined } | null>(null);
  useEffect(() => setAccess({ token: guestAccessFor(bookingId) }), [bookingId]);
  const isGuest = Boolean(access?.token);

  const { data: booking, isLoading } = useQuery({
    ...bookingDetailQueryOptions(bookingId ?? "", access?.token),
    enabled: Boolean(bookingId) && access !== null,
  });

  /*
   * Card only. Stripe returning success means the money moved, not that the booking exists:
   * the webhook still has to reach us and the provider commit still has to succeed. Polling
   * until it settles is what stops this screen congratulating someone whose booking was
   * rejected and refunded. An invoiced booking rests in PAYMENT_PENDING by design, so it
   * would poll forever — hence the gate.
   */
  const pollingSince = useRef(Date.now());
  const { data: checkout, isError: statusFailed } = useQuery({
    ...checkoutStatusQueryOptions(bookingId ?? "", access?.token),
    enabled: Boolean(bookingId) && access !== null && method === "card",
    refetchInterval: (query) => {
      if (!isSettling(query.state.data?.status)) return false;
      return Date.now() - pollingSince.current > POLL_LIMIT_MS ? false : POLL_INTERVAL_MS;
    },
  });

  /* Never render an outcome for a card booking before its first status lands. */
  const awaitingStatus = method === "card" && !checkout && !statusFailed;

  /* `access === null` keeps the query disabled, which reads as settled rather than loading. */
  if (isLoading || access === null || awaitingStatus) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <Loader />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex min-h-full items-center justify-center p-4 md:p-8">
        <EmptyState
          title={t("notFound")}
          action={
            <Button variant="brand" nativeButton={false} render={<Link href="/yachts" />}>
              {t("browse")}
            </Button>
          }
        />
      </div>
    );
  }

  if (hasFailed(checkout?.status)) {
    return (
      <div className="flex min-h-full items-center justify-center p-4 md:p-8">
        <EmptyState
          title={t("failed.title")}
          /* The server's own reason where it has one; it is written for the customer. */
          description={checkout?.failureReason ?? t("failed.body")}
          action={
            <Button variant="brand" nativeButton={false} render={<Link href="/yachts" />}>
              {t("browse")}
            </Button>
          }
        />
      </div>
    );
  }

  if (isSettling(checkout?.status)) {
    return (
      <div className="flex min-h-full items-center justify-center p-4 md:p-8">
        <EmptyState
          illustration={<Loader />}
          title={t("settling.title")}
          description={t("settling.body")}
        />
      </div>
    );
  }

  /* checkIn/checkOut are ISO datetimes, so parse them as instants and render the day in UTC. */
  const day = (date: string) => format.dateTime(new Date(date), "dayShort");
  const crewKey = CREW_KEYS.find((key) => key === booking.crewType);
  const crewLabel = crewKey ? tCrew(crewKey) : booking.crewType;

  const base = booking.priceLines.find((line) => !line.group && line.amount.amountMinor > 0);
  const mandatory = booking.priceLines.filter((line) => line.group === "mandatory");
  /*
   * `booking.get` carries no `optional` price group, so the picked add-ons and crew come from the
   * `extras[]` array. Mandatory items are dropped here so they are not repeated in both rows.
   */
  const mandatoryCodes = new Set(mandatory.map((line) => line.code));
  const selectedExtras = booking.extras
    .filter((extra) => !mandatoryCodes.has(extra.code))
    .map((extra) => extra.label);

  /*
   * `dueNow` comes off the booking rather than being re-derived from the policy and the total:
   * the server figure is what checkout charges, and it excludes the lines marked pay-at-check-in.
   * The security deposit is not carried on `booking.get`, so it shows only if a schedule row exists.
   */
  /*
   * Shares the yacht, not the booking: /bookings/<id> is authorised by a session or the guest
   * token in this browser, so a friend who opens it sees a sign-in screen. The listing page with
   * the dates is what someone actually wants to send. The Web Share API is absent on desktop
   * browsers and outside a secure context, hence the clipboard fallback.
   */
  const shareTrip = async () => {
    const url = `${window.location.origin}/${locale}/yachts/${booking.listing.id}`;
    const text = t("shareText", {
      name: booking.listing.title,
      dates: `${day(booking.checkIn)} → ${day(booking.checkOut)}`,
    });

    if (navigator.share) {
      /* A cancelled share sheet rejects; that is the customer changing their mind, not an error. */
      try {
        await navigator.share({ title: booking.listing.title, text, url });
        return;
      } catch {
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast.success(t("shareCopied"));
    } catch {
      toast.error(t("shareFailed"));
    }
  };

  const security = booking.paymentSchedule.find((entry) => entry.kind === "security_deposit");
  const dueNowMinor = booking.dueNow.amountMinor;
  const balanceMinor = booking.total.amountMinor - dueNowMinor;
  const balanceDate = booking.paymentPolicy.balanceDueAt ?? booking.nextPaymentDueAt;

  const rows: SummaryRow[] = [
    { label: t("summary.yacht"), value: booking.listing.title },
    { label: t("summary.dates"), value: `${day(booking.checkIn)} → ${day(booking.checkOut)}` },
    ...(crewLabel ? [{ label: t("summary.crew"), value: crewLabel }] : []),
    ...(mandatory.length
      ? [{ label: t("summary.mandatory"), value: mandatory.map((line) => line.label).join(", ") }]
      : []),
    ...(selectedExtras.length
      ? [{ label: t("summary.selectedExtras"), value: selectedExtras.join(", ") }]
      : []),
    ...(base
      ? [
          {
            label: t("summary.boatPrice"),
            value: money(base.amount.amountMinor),
            emphasis: "bold" as const,
          },
        ]
      : []),
    ...(security
      ? [
          {
            label: t("summary.deposit"),
            value: money(security.amount.amountMinor),
            emphasis: "bold" as const,
          },
        ]
      : []),
    ...(balanceMinor > 0
      ? [
          {
            /*
             * Undated means the remainder is the pay-at-check-in extra rather than a scheduled
             * instalment, so it is labelled as such instead of printing an empty date.
             */
            label: balanceDate
              ? t("summary.secondPayment", { date: day(balanceDate) })
              : t("summary.secondPaymentAtCheckIn"),
            value: money(balanceMinor),
            emphasis: "bold" as const,
          },
        ]
      : []),
    {
      label: t("summary.totalPrice"),
      value: money(booking.total.amountMinor),
      note: t("summary.perPerson", {
        price: money(Math.round(booking.total.amountMinor / booking.guests)),
      }),
      emphasis: "strong",
    },
    { label: t("summary.dueNow"), value: money(dueNowMinor), emphasis: "strong" },
  ];

  async function downloadReceipt() {
    if (!bookingId) return;
    setDownloading(true);
    try {
      const receipt = await client.booking.receipt({ id: bookingId, accessToken: access?.token });
      const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt-${receipt.reference}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="flex min-h-full justify-center px-4 pt-6 pb-8 md:px-6 md:py-23">
      <article className="relative isolate w-full max-w-201.5 overflow-hidden rounded-2xl border border-border bg-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0 aspect-[806/504]"
        >
          <Image
            src="/assets/illustrations/booking-confetti.svg"
            alt=""
            fill
            unoptimized
            className="object-cover object-top"
          />
        </div>

        <Confetti />

        <motion.div
          variants={GROUP}
          initial="hidden"
          animate="show"
          className="relative z-10 flex flex-col"
        >
          <motion.div
            variants={RISE}
            className="flex flex-col items-center gap-5 px-3 py-5 md:p-5 md:py-8"
          >
            <motion.div variants={POP}>
              <Image
                src="/assets/illustrations/booking-reserved.png"
                alt=""
                width={80}
                height={80}
                className="size-20"
              />
            </motion.div>
            <div className="flex flex-col items-center gap-4 pt-3 text-center">
              <h1 className="text-[28px] leading-[1.1] font-medium text-foreground md:text-[32px]">
                {t("reserved")}
              </h1>
              <p className="text-base leading-[1.4] text-foreground opacity-80">
                {t("remaining", { amount: money(booking.balanceDue.amountMinor) })}
              </p>
              <p className="text-sm leading-[1.3] font-medium text-natural-600">
                {isGuest ? t("guestEmailed") : t("emailed")}
              </p>
            </div>
            {/* Both destinations need an account: My Bookings for a signed-in customer, and the
                booking page itself, which is signed-in only by design (see detail-screen). A
                guest therefore goes through sign-in and lands on their booking — the password to
                get there is in the email this screen just told them about. */}
            <Button
              variant="neutral"
              nativeButton={false}
              render={
                isGuest && bookingId ? (
                  <Link
                    href={{ pathname: "/login", query: { redirect: `/bookings/${bookingId}` } }}
                  />
                ) : (
                  <Link href="/profile/bookings" />
                )
              }
              className="w-full md:w-auto"
            >
              {t("viewBooking")}
            </Button>
          </motion.div>

          <motion.div variants={RISE} className="flex flex-col p-5">
            <h2 className="py-2 text-xl leading-[1.3] font-bold text-foreground">
              {t("summaryTitle")}
            </h2>
            <dl className="flex flex-col">
              {rows.map((row, index) => (
                <Row key={row.label} row={row} last={index === rows.length - 1} />
              ))}
            </dl>
          </motion.div>

          <motion.div variants={RISE} className="flex flex-col">
            <span aria-hidden className="block h-px w-full bg-border" />
            <p className="p-5 text-center text-sm leading-[1.3] tracking-[0.56px] text-natural-500 uppercase">
              {t("quote")}
            </p>
          </motion.div>

          <motion.div variants={RISE} className="flex flex-col">
            <span aria-hidden className="block h-px w-full bg-border" />
            <div className="flex flex-col-reverse gap-4 p-5 md:flex-row">
              <Button
                variant="neutral"
                className="w-full md:flex-1"
                onClick={() => void shareTrip()}
              >
                <Share2 />
                {t("shareTrip")}
              </Button>
              {/* Paying by transfer, the invoice is the document that matters — it carries the
                  bank details and the amount due, which a receipt of nothing-paid-yet does not. */}
              {method === "invoice" && bookingId ? (
                <Button
                  variant="brand"
                  className="w-full md:flex-1"
                  nativeButton={false}
                  render={<Link href={`/bookings/${bookingId}/invoice`} />}
                >
                  <FileText />
                  {t("viewInvoice")}
                </Button>
              ) : (
                <Button
                  variant="brand"
                  className="w-full md:flex-1"
                  disabled={downloading}
                  onClick={() => void downloadReceipt()}
                >
                  <FileText />
                  {t("downloadReceipt")}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      </article>
    </section>
  );
}
