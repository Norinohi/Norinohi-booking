"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useDeleteFaqEntry } from "../hooks/use-faq";
import { FAQ_LOCALES, type FaqGroupRow } from "../types";

/*
 * A row's Delete removes the question in every language, because the row is the question. Per
 * language removal lives in the edit dialog, so the confirmation points there for the smaller
 * change.
 */
interface FaqDeleteDialogProps {
  group: FaqGroupRow | null;
  question: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function FaqDeleteDialog({
  group,
  question,
  open,
  onOpenChange,
}: FaqDeleteDialogProps) {
  const t = useTranslations("Admin.Faq");
  const deleteEntry = useDeleteFaqEntry();

  const locales = FAQ_LOCALES.filter((code) =>
    group?.translations.some((entry) => entry.locale === code),
  )
    .map((code) => t(`localeCodes.${code}`))
    .join(", ");

  const confirm = async () => {
    const anchor = group?.translations[0];
    if (!anchor) return;

    try {
      const result = await deleteEntry.mutateAsync({ id: anchor.id, allLocales: true });
      toast.success(t("deleted", { count: result.ids.length }), {
        description: result.cache.ok ? t("dialog.cacheRefreshing") : t("dialog.cacheStale"),
      });
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("dialog.failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showClose className="items-stretch">
        <DialogHeader>
          <DialogTitle>{t("deleteDialog.title")}</DialogTitle>
          <DialogDescription>
            {t("deleteDialog.description", { question, locales })}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("deleteDialog.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={!group || deleteEntry.isPending}
            onClick={() => void confirm()}
          >
            {deleteEntry.isPending ? t("deleteDialog.deleting") : t("deleteDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
