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

import { useCancelInvoice } from "../hooks/use-payments";
import type { InvoiceRow } from "../types";

/*
 * "They are not going to pay." Withdrawing cancels the booking waiting on the invoice, which
 * releases the operator's option — so it is confirmed rather than a one-click row action, and
 * the reason is required: it is the only record of why a held yacht was given back, and it is
 * what a colleague reads when the customer calls a week later.
 */
export default function WithdrawInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.Payments.withdraw");
  const reasonId = useId();
  const [reason, setReason] = useState("");
  const cancelInvoice = useCancelInvoice();

  useEffect(() => setReason(""), [invoice]);

  const confirm = async () => {
    if (!invoice || reason.trim().length === 0) return;

    try {
      await cancelInvoice.mutateAsync({ id: invoice.id, reason: reason.trim() });
      toast.success(t("withdrawn", { reference: invoice.reference }));
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
            {invoice ? t("description", { reference: invoice.reference }) : ""}
          </DialogDescription>
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
            placeholder={t("reasonPlaceholder")}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length === 0 || cancelInvoice.isPending}
            onClick={() => void confirm()}
          >
            {cancelInvoice.isPending ? t("withdrawing") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
