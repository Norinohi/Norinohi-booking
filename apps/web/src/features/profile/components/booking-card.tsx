"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowRight, Bookmark, Sailboat, Star, Users } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { BoatCardCharterDate } from "@/components/shared/data-display/boat-card";
import CardPhotos from "@/components/shared/data-display/card-photos";
import { dayToDisplay } from "@/lib/date";
import { Link } from "@/i18n/navigation";
import { useState } from "react";

import BoatCard, { type BoatCardProps } from "@/components/shared/data-display/boat-card";
import { MarinaPopover } from "@/components/shared/overlay/marina-popover";

import CancelBookingDialog from "@/components/shared/overlay/cancel-booking-dialog";

/*
 * BookingCard — Figma "My bookings / Boat Card" (972:54753 desktop, 973:82792 tablet).
 * At xl the history entry is a simplified horizontal card: image (carousel + bookmark on the
 * left) | info (marina, name + rating, charter/crew chips, charter dates, price) | View Details.
 * Below xl it renders the full search Boat Card. Booking-only chrome — the "Cancelled" chip and the
 * Cancel action (no Figma yet) — is added here, never on the shared BoatCard.
 */

const FORMATS = {
  day: { day: "numeric", month: "long", year: "numeric" },
  time: { hour: "2-digit", minute: "2-digit", hour12: false },
} as const;

export type BookingCardProps = BoatCardProps & {
  bookingId: string;
  cancellable: boolean;
  isCancelled: boolean;
  /**
   * Set when the booking is confirmed and still owes money, so the customer can settle
   * the second installment themselves rather than waiting to be chased.
   */
  payBalanceHref?: string;
  /** What that button says — the wording depends on whether anything has been paid yet. */
  payBalanceLabel?: string;
};

function Stamp({ value }: { value: BoatCardCharterDate }) {
  const format = useFormatter();

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold leading-[1.3] text-foreground">
        {format.dateTime(dayToDisplay(value.day), FORMATS.day)}
      </span>
      {value.time ? (
        <span className="text-sm font-medium leading-[1.3] text-natural-500">{value.time}</span>
      ) : null}
    </div>
  );
}

export default function BookingCard({
  className,
  bookingId,
  cancellable,
  isCancelled,
  payBalanceHref,
  payBalanceLabel,
  ...booking
}: BookingCardProps) {
  const t = useTranslations("Common.boatCard");
  const tBookings = useTranslations("Bookings");
  const [cancelOpen, setCancelOpen] = useState(false);

  const cancelledChip = isCancelled ? (
    <Chip variant="neutral" className="shrink-0 bg-error-50 text-error-600">
      {tBookings("statusCancelled")}
    </Chip>
  ) : null;

  const renderCancel = (fullWidth: boolean) =>
    cancellable ? (
      <Button
        variant="subtle"
        size="md"
        onClick={() => setCancelOpen(true)}
        className={cn(
          "text-error-600 hover:text-error-700",
          fullWidth ? "w-full border-border" : "hover:border-transparent",
        )}
      >
        {tBookings("cancel.action")}
      </Button>
    ) : null;

  return (
    <>
      {/* Tablet/mobile — the full search card; the booking's cancel/status sits inside it (footer slot). */}
      <BoatCard
        {...booking}
        className={cn("xl:hidden", className)}
        footer={cancellable ? renderCancel(true) : isCancelled ? cancelledChip : null}
      />

      {/* Desktop — the simplified history card. */}
      <article
        className={cn(
          "hidden w-full overflow-hidden rounded-2xl border border-natural-100 bg-card xl:grid xl:grid-cols-[minmax(0,452px)_minmax(0,1fr)_auto] xl:items-stretch xl:gap-6",
          className,
        )}
      >
        {/* Image */}
        <div className="relative overflow-hidden rounded-l-2xl">
          <CardPhotos
            images={booking.images}
            imageAlt={booking.imageAlt}
            priority={booking.priority}
            sizes="(min-width: 1280px) 30vw, 100vw"
          />

          <div className="absolute top-4 left-4">
            <Button
              type="button"
              variant="subtle"
              size="icon-md"
              aria-label={t("save")}
              className="bg-black/12 text-white hover:bg-black/25 hover:text-white focus-visible:ring-white/60"
            >
              <Bookmark />
            </Button>
          </div>
        </div>

        {/* Info */}
        <div className="flex min-w-0 flex-col gap-4 border-r border-natural-50 py-6 pr-6">
          <div className="flex flex-col gap-3">
            <MarinaPopover marina={booking.marina} />

            <div className="flex flex-wrap items-center gap-2">
              <h3 className="min-w-0 truncate text-[32px] font-medium leading-[1.1] text-foreground">
                {booking.name}
              </h3>
              <Chip className="shrink-0 bg-transparent p-1.5 text-gold">
                <Star className="fill-current" />
                {booking.rating}
              </Chip>
              {cancelledChip}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Chip variant="neutral">
                <Sailboat />
                {booking.charterType}
              </Chip>
              <Chip variant="neutral">
                <Users />
                {booking.crew}
              </Chip>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {booking.start ? <Stamp value={booking.start} /> : null}
            <ArrowRight className="size-4 shrink-0 text-foreground" />
            {booking.end ? <Stamp value={booking.end} /> : null}
          </div>

          <p className="text-[42px] font-bold leading-[1.15] text-black">{booking.price}</p>
        </div>

        {/* Action */}
        <div className="flex flex-col items-center justify-center gap-3 py-6 pr-6">
          {payBalanceHref ? (
            <Button
              variant="brand"
              size="md"
              nativeButton={false}
              render={<Link href={payBalanceHref} />}
            >
              {payBalanceLabel ?? tBookings("payBalance", { amount: "" })}
            </Button>
          ) : null}
          <Button
            variant="neutral"
            size="md"
            nativeButton={booking.detailHref ? false : undefined}
            render={booking.detailHref ? <Link href={booking.detailHref} /> : undefined}
            className="capitalize"
          >
            {t("viewDetails")}
          </Button>
          {renderCancel(false)}
        </div>
      </article>

      <CancelBookingDialog bookingId={bookingId} open={cancelOpen} onOpenChange={setCancelOpen} />
    </>
  );
}
