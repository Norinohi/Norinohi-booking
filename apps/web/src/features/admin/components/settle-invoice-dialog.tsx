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

import { useAmount } from "../hooks/use-amount";
import { useSettleInvoice } from "../hooks/use-payments";
import type { InvoiceRow } from "../types";

/*
 * "The transfer arrived." Settling is the act that commits the booking with the operator, so it
 * is deliberately a dialog and not a row button: it spends real inventory and cannot be undone
 * from here — a mistake has to be walked back through cancel-and-refund.
 *
 * The amount is prefilled from the invoice and editable, because what lands is not always what
 * was billed: bank fees are deducted in transit, and staff must record the real figure rather
 * than a number that makes the books balance.
 *
 * A provider refusal comes back in `providerRejection` rather than as an error. The money did
 * arrive and the settlement stands, so this reports it as a warning and leaves the booking in
 * the refund queue instead of implying nothing was recorded.
 */
export default function SettleInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: {
  invoice: InvoiceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.Payments.settle");
  const amount = useAmount();
  const amountId = useId();
  const noteId = useId();
  const [received, setReceived] = useState("");
  const [note, setNote] = useState("");
  const settle = useSettleInvoice();

  // Reopening on a different invoice must not carry the previous row's figures over.
  useEffect(() => {
    if (invoice) setReceived((invoice.amount.amountMinor / 100).toFixed(2));
    setNote("");
  }, [invoice]);

  const parsed = Number(received.replace(",", "."));
  const validAmount = received.trim() !== "" && Number.isFinite(parsed) && parsed >= 0;

  const confirm = async () => {
    if (!invoice || !validAmount) return;
    const amountMinor = Math.round(parsed * 100);

    try {
      const result = await settle.mutateAsync({
        id: invoice.id,
        amountMinor,
        note: note.trim() || undefined,
      });

      if (result.providerRejection) {
        toast.warning(t("rejected", { reason: result.providerRejection }));
      } else {
        toast.success(t("settled", { reference: invoice.reference }));
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
            {invoice ? t("description", { reference: invoice.reference }) : ""}
          </DialogDescription>
        </DialogHeader>

        {invoice ? (
          <div className="flex w-full flex-col gap-1 rounded-xl bg-natural-50 p-4 text-left">
            <span className="text-sm text-natural-500">
              {invoice.billingName ?? invoice.guestName ?? invoice.billingEmail}
              {" · "}
              {invoice.listingTitle}
            </span>
            <span className="text-base font-bold text-foreground">
              {t("invoiced", { number: invoice.number, amount: amount(invoice.amount) })}
            </span>
          </div>
        ) : null}

        <div className="flex w-full flex-col gap-1.5 text-left">
          <label htmlFor={amountId} className="text-sm leading-4.25 font-semibold text-foreground">
            {t("amountLabel", { currency: invoice?.amount.currency ?? "" })}
          </label>
          <TextField
            id={amountId}
            inputMode="decimal"
            value={received}
            aria-invalid={!validAmount}
            onChange={(event) => setReceived(event.target.value)}
          />
          <p className="text-sm text-natural-500">{t("amountHint")}</p>
        </div>

        <div className="flex w-full flex-col gap-1.5 text-left">
          <label htmlFor={noteId} className="text-sm leading-4.25 font-semibold text-foreground">
            {t("noteLabel")}
          </label>
          <TextField
            id={noteId}
            value={note}
            placeholder={t("notePlaceholder")}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="brand"
            disabled={!validAmount || settle.isPending}
            onClick={() => void confirm()}
          >
            {settle.isPending ? t("settling") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
