"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Select } from "@yacht-charter/ui/components/form/select";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { useProviderCapabilities, useStartSync } from "../hooks/use-sync-runs";
import type { ProviderKey } from "../types";

/*
 * SyncControls — starting an import by hand, above the run history on /sync.
 *
 * The cron routes drive this normally. Staff need it for the cases a schedule cannot cover: a
 * provider that was down at the scheduled hour, or a mapping fix that should not wait until
 * tomorrow. The call returns as soon as the runs are opened, so a green toast means "started",
 * never "finished" — the table below is where the outcome actually appears.
 */

/* Same sentinel as the history filters: "" would blank the Select trigger. */
const ALL = "all";

const PROVIDERS: readonly ProviderKey[] = ["mock", "booking_manager", "nausys"];

/** The capability flags worth showing staff, in the order they matter to a booking. */
const CAPABILITY_KEYS = [
  "supportsLiveQuote",
  "supportsOptions",
  "supportsExtrasMutation",
  "supportsWebhooks",
] as const;

export default function SyncControls() {
  const t = useTranslations("Admin.Sync.controls");
  const [provider, setProvider] = useState(ALL);
  const catalogue = useStartSync("catalogue");
  const availability = useStartSync("availability");
  const { data: capabilities } = useProviderCapabilities();

  const running = catalogue.isPending || availability.isPending;

  const start = (mutation: typeof catalogue) => {
    const target = PROVIDERS.find((key) => key === provider);

    mutation.mutate(target ? { provider: target } : {}, {
      onSuccess: (result) => {
        const started = result.runs.filter((run) => run.started);
        const refused = result.runs.filter((run) => !run.started);

        /* A connector that is already importing is the expected answer, not a failure — but
           saying "started" over it would be a lie, so each half gets its own message. */
        if (started.length > 0) toast.success(t("started", { count: started.length }));
        if (refused.length > 0) toast.info(t("skipped", { count: refused.length }));
        if (result.runs.length === 0) toast.info(t("noProviders"));
      },
      onError: (error: Error) => toast.error(error.message),
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="min-w-0 md:w-56">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("provider")}
            value={provider}
            onValueChange={setProvider}
            options={[
              { value: ALL, label: t("allProviders") },
              ...PROVIDERS.map((key) => ({ value: key, label: key })),
            ]}
          />
        </div>

        <Button
          variant="brand"
          className="md:w-auto"
          loading={catalogue.isPending}
          disabled={running}
          onClick={() => start(catalogue)}
        >
          <RefreshCw />
          {t("startCatalogue")}
        </Button>
        <Button
          variant="neutral"
          className="md:w-auto"
          loading={availability.isPending}
          disabled={running}
          onClick={() => start(availability)}
        >
          <RefreshCw />
          {t("startAvailability")}
        </Button>
      </div>

      {capabilities ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm leading-4.5 font-medium text-natural-500">
            {t("capabilities")}
          </span>
          {CAPABILITY_KEYS.map((key) => (
            <Chip key={key} variant={capabilities[key] ? "success" : "outline"}>
              {t(`capability.${key}`)}
            </Chip>
          ))}
        </div>
      ) : null}

      <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("hint")}</p>
    </div>
  );
}
