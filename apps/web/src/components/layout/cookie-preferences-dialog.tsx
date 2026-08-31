"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Switch } from "@yacht-charter/ui/components/form/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

/**
 * The categories are the ones this site actually has, which is why there is no marketing
 * row: nothing here sets an advertising cookie. A toggle that governs nothing would be a
 * false disclosure, and a false disclosure is the part a regulator reads first.
 *
 * `necessary` and `functional` are stated rather than offered — they map to the Consent
 * Mode signals we always grant. Only `analytics` is a decision.
 */
const ALWAYS_ON = ["necessary", "functional"] as const;

export type CookiePreferencesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Seeds the toggle each time the dialog opens, so reopening shows the stored answer. */
  initialAnalytics: boolean;
  onSave: (analytics: boolean) => void;
};

export function CookiePreferencesDialog({
  open,
  onOpenChange,
  initialAnalytics,
  onSave,
}: CookiePreferencesDialogProps) {
  const t = useTranslations("Layout.CookieConsent.dialog");
  const analyticsId = useId();
  const [analytics, setAnalytics] = useState(initialAnalytics);

  /* Reopening after a saved answer has to show that answer, not the last toggle position. */
  useEffect(() => {
    if (open) setAnalytics(initialAnalytics);
  }, [open, initialAnalytics]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        showClose
        closeLabel={t("close")}
        className="items-stretch gap-6 md:max-w-125"
      >
        <DialogHeader className="items-start text-left">
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {ALWAYS_ON.map((category) => (
            <div key={category} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-4">
                <p className="text-base font-semibold text-foreground">{t(`${category}.title`)}</p>
                <span className="shrink-0 text-sm text-natural-400">{t("alwaysActive")}</span>
              </div>
              <p className="text-sm text-natural-600">{t(`${category}.description`)}</p>
            </div>
          ))}

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-4">
              <label
                htmlFor={analyticsId}
                className="cursor-pointer text-base font-semibold text-foreground"
              >
                {t("analytics.title")}
              </label>
              <Switch id={analyticsId} checked={analytics} onCheckedChange={setAnalytics} />
            </div>
            <p className="text-sm text-natural-600">{t("analytics.description")}</p>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
          <Button variant="neutral" size="sm" onClick={() => onSave(analytics)}>
            {t("save")}
          </Button>
          <Button variant="brand" size="sm" onClick={() => onSave(true)}>
            {t("acceptAll")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
