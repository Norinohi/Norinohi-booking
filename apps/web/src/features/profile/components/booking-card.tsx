"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { YachtCardDetailsButton } from "@/components/shared/data-display/yacht-card/parts";
import type { YachtCardData } from "@/components/shared/data-display/yacht-card/types";
import YachtCard from "@/components/shared/data-display/yacht-card/yacht-card";
import CancelBookingDialog from "@/components/shared/overlay/cancel-booking-dialog";
import { Link } from "@/i18n/navigation";

/*
 * BookingCard: Figma "My bookings / Boat Card" (972:54753 desktop, 973:82792 tablet).
 * At xl the history entry is the `history` layout: image | info (marina, name + rating,
 * charter/crew chips, charter dates, price) | actions. Below xl it renders the `row` search card.
 * Booking-only chrome, the "Cancelled" chip and the Cancel action (no Figma yet), is added here,
 * never inside the shared YachtCard.
 */

export interface BookingCardProps extends YachtCardData {
  bookingId: string;
  cancellable: boolean;
  isCancelled: boolean;
  priority?: boolean;
  className?: string;
  /**
   * Set when the booking is confirmed and still owes money, so the customer can settle
   * the second installment themselves rather than waiting to be chased.
   */
  payBalanceHref?: string;
  /** What that button says: the wording depends on whether anything has been paid yet. Required
   *  alongside `payBalanceHref`: a Pay button with no amount is never right. */
  payBalanceLabel?: string;
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
  const tBookings = useTranslations("Bookings");
  const [cancelOpen, setCancelOpen] = useState(false);

  const cancelledChip = isCancelled ? (
    <Chip variant="neutral" className="shrink-0 bg-error-50 text-error-600">
      {tBookings("statusCancelled")}
    </Chip>
  ) : null;

  /* The three actions share one shell - same height from size="md", same width from the
     column's stretch, same bordered surface - so only colour separates them. Cancel had been
     borderless, which at the bottom of the stack read as a link rather than the third choice. */
  const cancel = cancellable ? (
    <Button
      variant="neutral"
      size="md"
      onClick={() => setCancelOpen(true)}
      className="w-full border-error-200 text-error-600 hover:border-error-300 hover:bg-error-50 hover:text-error-700"
    >
      {tBookings("cancel.action")}
    </Button>
  ) : null;

  return (
    <>
      {/* Tablet/mobile: the full search card; the booking's cancel/status sits inside it (footer slot). */}
      <YachtCard
        layout="row"
        {...booking}
        className={cn("xl:hidden", className)}
        footer={cancel ?? (isCancelled ? cancelledChip : null)}
      />

      <YachtCard
        layout="history"
        {...booking}
        className={className}
        titleAside={cancelledChip}
        actions={
          <>
            {payBalanceHref && payBalanceLabel ? (
              <Button
                variant="brand"
                size="md"
                nativeButton={false}
                render={<Link href={payBalanceHref} />}
                /* The only label carrying a number, so the only one that can outgrow the track in
                   some locale or at some amount. It wraps there instead of forcing the column
                   wider; at the usual length it stays one line and h-12 like its neighbours. */
                className="h-auto min-h-12 py-2 text-center leading-tight whitespace-normal"
              >
                {payBalanceLabel}
              </Button>
            ) : null}
            <YachtCardDetailsButton detailHref={booking.detailHref} className="capitalize" />
            {cancel}
          </>
        }
      />

      <CancelBookingDialog bookingId={bookingId} open={cancelOpen} onOpenChange={setCancelOpen} />
    </>
  );
}
