"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
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

import { useAmount } from "../hooks/use-amount";
import { useRefundBooking } from "../hooks/use-payments";
import type { BookingAdminRow } from "../types";

/*
 * Returning the money on a booking sitting at REFUND_PENDING.
 *
 * Card payments go back through Stripe on their own; a bank transfer cannot, and the procedure
 * reports those in `requiresManualTransfer` instead of pretending they were returned. That is
 * the checkbox: staff tick it only after they have actually sent the money, because nothing
 * else can evidence it and the booking cannot reach REFUNDED without it. It stays off by
 * default so the safe outcome is the one that happens when nobody reads the dialog.
 *
 * Running this twice is safe — the procedure is keyed per payment, so a second run finishes a
 * partial refund rather than paying anyone twice.
 */
export default function RefundBookingDialog({
  booking,
  open,
  onOpenChange,
}: {
  booking: BookingAdminRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.Payments.refund");
  const amount = useAmount();
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const [manualSettled, setManualSettled] = useState(false);
  const refund = useRefundBooking();

  useEffect(() => {
    setReason("");
    setManualSettled(false);
  }, [booking]);

  const confirm = async () => {
    if (!booking) return;

    try {
      const result = await refund.mutateAsync({
        id: booking.id,
        reason: reason.trim() || undefined,
        manualTransferSettled: manualSettled,
      });

      if (result.requiresManualTransfer > 0) {
        // Not a failure: the card leg went back, and this is the part a human still owes.
        toast.warning(t("manualPending", { count: result.requiresManualTransfer }));
      } else if (result.status === "REFUNDED") {
        toast.success(t("refunded", { amount: amount(result.refunded) }));
      } else {
        toast.success(t("partial", { amount: amount(result.refunded) }));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose className="items-stretch">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {booking ? t("description", { reference: booking.reference }) : ""}
          </DialogDescription>
        </DialogHeader>

        {booking ? (
          <div className="flex w-full flex-col gap-1 rounded-xl bg-natural-50 p-4 text-left">
            <span className="text-sm text-natural-500">
              {booking.customerName ?? booking.customerEmail} · {booking.listingTitle}
            </span>
            <span className="text-base font-bold text-foreground">
              {t("collected", { amount: amount(booking.paid) })}
            </span>
            {booking.cancelReason ? (
              <span className="text-sm text-natural-500">
                {t("cancelReason", { reason: booking.cancelReason })}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="flex w-full flex-col gap-1.5 text-left">
          <label htmlFor={reasonId} className="text-sm leading-4.25 font-semibold text-foreground">
            {t("reasonLabel")}
          </label>
          <TextField
            id={reasonId}
            value={reason}
            placeholder={t("reasonPlaceholder")}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <label className="flex w-full cursor-pointer items-start gap-2 text-left text-sm text-foreground">
          <Checkbox
            checked={manualSettled}
            onCheckedChange={(checked) => setManualSettled(checked === true)}
          />
          <span>
            {t("manualLabel")}
            <span className="block text-natural-500">{t("manualHint")}</span>
          </span>
        </label>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button variant="brand" disabled={refund.isPending} onClick={() => void confirm()}>
            {refund.isPending ? t("refunding") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
