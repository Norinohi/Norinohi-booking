"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { BellRing, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useSendPaymentReminders, useSweepExpiries } from "../hooks/use-maintenance";

/*
 * MaintenanceControls — the two scheduled jobs, runnable by hand.
 *
 * Both are driven by cron normally. Staff need them for the cases a schedule cannot cover: a
 * slot stuck because a checkout was abandoned and the customer is on the phone now, and a batch
 * of reminders that did not go out because the mailer was down. Both are idempotent, so the
 * worst a second click does is nothing.
 */

export default function MaintenanceControls() {
  const t = useTranslations("Admin.Sync.maintenance");
  const sweep = useSweepExpiries();
  const remind = useSendPaymentReminders();

  const runSweep = () => {
    sweep.mutate(
      {},
      {
        onSuccess: (result) => {
          const moved = result.quotesExpired + result.holdsExpired + result.bookingsQuoteExpired;

          toast.success(t("swept", { count: moved, reaped: result.syncRunsReaped }));

          /* Money is held against charters nobody has confirmed. Reported separately because
             the sweep cannot fix it — someone has to ask the provider. */
          if (result.staleConfirmations.length > 0) {
            toast.warning(t("staleConfirmations", { count: result.staleConfirmations.length }));
          }
          if (result.releaseFailures.length > 0) {
            toast.warning(t("releaseFailures", { count: result.releaseFailures.length }));
          }
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  const runReminders = () => {
    remind.mutate(
      {},
      {
        onSuccess: (result) => {
          toast.success(t("reminded", { count: result.sent }));
          if (result.skipped > 0) toast.info(t("remindSkipped", { count: result.skipped }));
        },
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Button
          variant="neutral"
          className="md:w-auto"
          loading={sweep.isPending}
          onClick={runSweep}
        >
          <Timer />
          {t("sweep")}
        </Button>
        <Button
          variant="neutral"
          className="md:w-auto"
          loading={remind.isPending}
          onClick={runReminders}
        >
          <BellRing />
          {t("remind")}
        </Button>
      </div>

      <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("hint")}</p>
    </div>
  );
}
