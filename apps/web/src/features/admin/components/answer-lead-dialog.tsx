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

import { useAnswerLead } from "../hooks/use-inbox";
import type { LeadRow } from "../types";

/*
 * The reply box for the pre-booking funnel — the same shape as AnswerEnquiryDialog, over a lead
 * instead of a booking question. The two are not one component: a lead has no booking, its
 * message is optional, and the yacht line is the only context there is.
 */
export default function AnswerLeadDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: LeadRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.Inbox.leadAnswer");
  const answerId = useId();
  const [answer, setAnswer] = useState("");
  const [close, setClose] = useState(true);
  const answerLead = useAnswerLead();

  const send = async () => {
    if (!lead) return;
    try {
      await answerLead.mutateAsync({ id: lead.id, answer: answer.trim(), close });
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
          <DialogDescription>{lead ? t("description", { name: lead.name }) : ""}</DialogDescription>
        </DialogHeader>

        {lead ? (
          <div className="flex w-full flex-col gap-1 rounded-xl bg-natural-50 p-4 text-left">
            <span className="text-sm text-natural-500">
              {lead.email}
              {lead.listingTitle ? ` · ${lead.listingTitle}` : ""}
            </span>
            {/* Every entry point leaves the message box optional, so there is often nothing
                to quote back — the enquiry is still worth answering. */}
            <p className="text-base whitespace-pre-wrap text-foreground">
              {lead.message ?? t("noMessage")}
            </p>
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
            disabled={answer.trim().length === 0 || answerLead.isPending}
            onClick={() => void send()}
          >
            {t("send")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
