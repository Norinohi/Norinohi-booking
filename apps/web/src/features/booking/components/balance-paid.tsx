"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import { Image } from "@/components/shared/data-display/image";
import { useMoney } from "@/hooks/use-money";
import { GROUP, POP, RISE } from "@/lib/motion";

import type { BookingDetail } from "../api/queries";

/**
 * The end of the payment story: nothing left to owe. Shaped like the confirmation screen on
 * purpose — the second payment is as much a moment as the first, and a bare notice read as
 * an error state.
 */
export default function BalancePaid({
  booking,
  bookingId,
  isGuest,
}: {
  booking: BookingDetail;
  bookingId: string;
  isGuest: boolean;
}) {
  const t = useTranslations("Booking.balance");
  const money = useMoney();
  const format = useFormatter();
  const day = (date: string) => format.dateTime(new Date(date), "dayShort");

  return (
    <section className="flex min-h-full justify-center px-4 pt-6 pb-8 md:px-6 md:py-16">
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
                {t("paid.title")}
              </h1>
              <p className="text-base leading-[1.4] text-foreground opacity-80">
                {booking.listing.title} · {day(booking.checkIn)} → {day(booking.checkOut)}
              </p>
              <p className="text-sm leading-[1.3] font-medium text-natural-600">
                {t("paid.body", { reference: booking.reference })}
              </p>
            </div>
          </motion.div>

          <motion.div variants={RISE} className="flex flex-col px-5 pb-5">
            <dl className="flex flex-col">
              <Row
                label={t("summary.total")}
                value={money(booking.total.amountMinor, booking.total.currency)}
              />
              <Row
                label={t("summary.paid")}
                value={money(booking.paidTotal.amountMinor, booking.paidTotal.currency)}
              />
              <Row label={t("summary.due")} value={money(0, booking.total.currency)} emphasis />
            </dl>
          </motion.div>

          <motion.div variants={RISE} className="flex flex-col">
            <span aria-hidden className="block h-px w-full bg-border" />
            <div className="flex flex-col-reverse gap-4 p-5 md:flex-row">
              <Button
                variant="neutral"
                className="w-full md:flex-1"
                nativeButton={false}
                render={<Link href="/profile/bookings" />}
              >
                {t("viewBookings")}
              </Button>
              {/* The booking page is signed-in only by design (see detail-screen), so a guest
                  who has no password yet goes through sign-in and lands on it afterwards. */}
              <Button
                variant="brand"
                className="w-full md:flex-1"
                nativeButton={false}
                render={
                  isGuest ? (
                    <Link
                      href={{ pathname: "/login", query: { redirect: `/bookings/${bookingId}` } }}
                    />
                  ) : (
                    <Link href={`/bookings/${bookingId}`} />
                  )
                }
              >
                {t("paid.viewBooking")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      </article>
    </section>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-dashed border-border py-3 last:border-b-0">
      <dt className="text-base leading-[1.4] font-bold text-foreground">{label}</dt>
      <dd
        className={
          emphasis
            ? "text-xl leading-[1.3] font-bold text-foreground"
            : "text-base leading-[1.4] text-natural-600"
        }
      >
        {value}
      </dd>
    </div>
  );
}
