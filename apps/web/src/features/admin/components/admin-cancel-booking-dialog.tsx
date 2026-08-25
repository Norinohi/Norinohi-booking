"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { useCancelBooking } from "../hooks/use-payments";
import type { BookingAdminDetail } from "../types";

/*
 * Cancelling on the customer's behalf, which the customer's own dialog cannot do: their
 * `booking.cancel` refuses anything CONFIRMED, and a confirmed charter is most of what support
 * is asked to cancel.
 *
 * Two outcomes rather than one. A confirmed booking lands at REFUND_PENDING, not CANCELLED,
 * because money was collected and dropping the row would drop the debt with it — the refund
 * queue is where it is actually returned, and the toast says so rather than letting "cancelled"
 * read as "refunded".
 *
 * The warning toast is the point of the dialog. `providerReleased: false` means we cancelled our
 * side and the vendor kept the reservation: Booking Manager refuses to release a confirmed one
 * through the API at all, so the charter still stands with the operator and someone has to
 * settle it by hand. Refunding on the strength of our own status alone would return the guest's
 * money on a week we are still being billed for. The toast is the immediate signal; the banner
 * on the screen behind it is the one that survives a reload.
 */
export default function AdminCancelBookingDialog({
  booking,
  providerLabel,
  open,
  onOpenChange,
}: {
  booking: BookingAdminDetail;
  providerLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.StaffBooking.cancel");
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const cancel = useCancelBooking();

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const confirm = async () => {
    try {
      const result = await cancel.mutateAsync({
        id: booking.id,
        reason: reason.trim() || undefined,
      });

      if (!result.providerReleased) {
        toast.warning(
          t("providerHeld", {
            provider: providerLabel,
            error: result.providerReleaseError ?? t("providerHeldUnknown"),
          }),
          /* Outlives the default toast: it is the only place the vendor's own words appear. */
          { duration: 30_000 },
        );
      } else if (result.status === "REFUND_PENDING") {
        toast.success(t("successRefund"));
      } else {
        toast.success(t("success"));
      }

      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("error"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose className="items-stretch">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", {
              reference: booking.reference,
              customer: booking.customerName ?? booking.customerEmail,
            })}
          </DialogDescription>
        </DialogHeader>

        {booking.status === "CONFIRMED" ? (
          <p className="w-full rounded-xl border border-warning-200 bg-warning-50 p-4 text-left text-sm text-warning-600">
            {t("confirmedWarning")}
          </p>
        ) : null}

        <div className="flex w-full flex-col gap-1.5 text-left">
          <label htmlFor={reasonId} className="text-sm leading-4.25 font-semibold text-foreground">
            {t("reasonLabel")}
          </label>
          <TextField
            id={reasonId}
            multiline
            value={reason}
            className="h-full"
            placeholder={t("reasonPlaceholder")}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("keep")}
          </Button>
          <Button variant="destructive" loading={cancel.isPending} onClick={() => void confirm()}>
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
