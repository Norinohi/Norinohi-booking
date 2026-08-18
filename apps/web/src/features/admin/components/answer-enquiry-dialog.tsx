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
import { useId, useState } from "react";
import { toast } from "sonner";

import { useAnswerEnquiry } from "../hooks/use-inbox";
import type { EnquiryRow } from "../types";

/*
 * The reply box. Sending is the customer-facing act — the answer is emailed to them with their
 * question quoted back — so the question is shown here in full rather than truncated like the
 * table row, and the dialog closes only once the server has taken it.
 */
export default function AnswerEnquiryDialog({
  enquiry,
  open,
  onOpenChange,
}: {
  enquiry: EnquiryRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.Inbox.answer");
  const answerId = useId();
  const [answer, setAnswer] = useState("");
  const [close, setClose] = useState(true);
  const answerEnquiry = useAnswerEnquiry();

  const send = async () => {
    if (!enquiry) return;
    try {
      await answerEnquiry.mutateAsync({ id: enquiry.id, answer: answer.trim(), close });
      toast.success(t("sent"));
      setAnswer("");
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
            {enquiry ? t("description", { reference: enquiry.reference }) : ""}
          </DialogDescription>
        </DialogHeader>

        {enquiry ? (
          <div className="flex w-full flex-col gap-1 rounded-xl bg-natural-50 p-4 text-left">
            <span className="text-sm text-natural-500">
              {enquiry.customerName} · {enquiry.listingTitle}
            </span>
            <p className="text-base whitespace-pre-wrap text-foreground">{enquiry.question}</p>
          </div>
        ) : null}

        <div className="flex w-full flex-col gap-1.5 text-left">
          <label htmlFor={answerId} className="text-sm leading-4.25 font-semibold text-foreground">
            {t("label")}
          </label>
          <TextField
            id={answerId}
            multiline
            value={answer}
            className="h-full"
            onChange={(event) => setAnswer(event.target.value)}
            placeholder={t("placeholder")}
          />
        </div>

        <label className="flex w-full cursor-pointer items-center gap-2 text-left text-sm text-foreground">
          <Checkbox checked={close} onCheckedChange={(checked) => setClose(checked === true)} />
          {t("close")}
        </label>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="brand"
            disabled={answer.trim().length === 0 || answerEnquiry.isPending}
            onClick={() => void send()}
          >
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
