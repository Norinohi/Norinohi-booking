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
import { useId, useState } from "react";
import { toast } from "sonner";

import { useCancelBooking } from "../hooks/use-cancel-booking";

/*
 * Cancelling a booking is irreversible, so it goes through a confirm dialog with an optional reason.
 * On success the list query is invalidated (see useCancelBooking), which flips the booking to a
 * "Cancelled" chip and drops its Cancel button.
 */
export default function CancelBookingDialog({
  bookingId,
  open,
  onOpenChange,
}: {
  bookingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Bookings.cancel");
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const cancelBooking = useCancelBooking();

  const confirm = async () => {
    try {
      await cancelBooking.mutateAsync({ id: bookingId, reason: reason.trim() || undefined });
      toast.success(t("success"));
      setReason("");
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
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex w-full flex-col gap-1.5 text-left">
          <label htmlFor={reasonId} className="text-sm leading-4.25 font-semibold text-foreground">
            {t("reasonLabel")}
          </label>
          <TextField
            id={reasonId}
            multiline
            value={reason}
            className="h-full"
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("reasonPlaceholder")}
          />
        </div>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("keep")}
          </Button>
          <Button
            variant="destructive"
            disabled={cancelBooking.isPending}
            onClick={() => void confirm()}
          >
            {t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
