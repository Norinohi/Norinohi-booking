"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { useFormatter, useTranslations } from "next-intl";

import { useSyncRunStatus } from "../hooks/use-sync-runs";
import type { ProviderKey } from "../types";

/*
 * SyncRunErrors — the panel behind an expanded row of the run table. `syncRuns` only carries
 * an error *count*, so the messages come from `admin.provider.syncStatus`, which is fetched
 * lazily: this component is mounted only while its row is open.
 */

const SKELETON_ROWS = 3;

export default function SyncRunErrors({
  syncRunId,
  provider,
}: {
  syncRunId: string;
  provider: ProviderKey;
}) {
  const t = useTranslations("Admin.Sync");
  const format = useFormatter();

  const { data, isPending, isError } = useSyncRunStatus(syncRunId, provider);

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: SKELETON_ROWS }, (_, row) => (
          <Skeleton key={row} className="h-5 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm font-medium text-natural-500">{t("details.error")}</p>;
  }

  if (data.errors.length === 0) {
    return <p className="text-sm font-medium text-natural-500">{t("details.empty")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm leading-[1.3] font-bold text-foreground">{t("details.title")}</h3>
      <ul className="flex flex-col gap-2">
        {data.errors.map((error) => (
          <li key={error.id} className="flex flex-wrap items-start gap-2">
            <Chip variant="error">{t(`errorType.${error.errorType}`)}</Chip>
            <span className="min-w-0 flex-1 text-sm leading-[1.4] font-medium text-foreground">
              {error.message}
            </span>
            <span className="text-sm leading-[1.4] font-medium whitespace-nowrap text-natural-500">
              {format.dateTime(new Date(error.createdAt), {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
