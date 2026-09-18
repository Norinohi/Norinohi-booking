"use client";

import { PROVIDER_KEYS } from "@yacht-charter/env/providers";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@yacht-charter/ui/components/data-display/table";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { Select } from "@yacht-charter/ui/components/form/select";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useInstant } from "../../shared/hooks/use-instant";
import { useSyncRuns } from "../hooks/use-sync-runs";
import { type SyncRunKind, type SyncRunRow, type SyncRunState } from "../types";
import { toProviderKey } from "../../shared/types";
import SyncRunErrors from "./sync-run-errors";

/*
 * SyncRunsTable — the run history of /sync: provider/kind/status filters over a table of
 * runs, newest first, each expandable into its errors.
 * Columns follow the DiscountsTable conventions (min-width so narrow screens scroll, 50px
 * rows, header on natural-50). Status carries the colour: success is positive, partial a
 * warning, failed an error, running brand, pending neutral — the counts stay monochrome so
 * the status is what the eye lands on first.
 */

/*
 * Sentinel for the unfiltered "All …" option, mapped to `undefined` in the query input.
 * A real value (not "") because the Select trigger renders the placeholder for a falsy
 * selection, which would blank the control.
 */
const ALL = "all";

const KINDS: readonly SyncRunKind[] = ["catalogue", "availability", "pricing", "media"];
const STATUSES: readonly SyncRunState[] = ["pending", "running", "success", "failed", "partial"];

const STATUS_VARIANTS = {
  success: "success",
  partial: "warning",
  failed: "error",
  running: "brand",
  pending: "neutral",
} as const satisfies Record<SyncRunState, string>;

const COLUMN_COUNT = 8;

const SKELETON_ROWS = 5;

/** Per-column skeleton widths mirroring typical cell content. */
const SKELETON_WIDTHS = ["w-24", "w-20", "w-16", "w-3/4", "w-10", "w-28", "w-28", "w-8"];

export default function SyncRunsTable() {
  const t = useTranslations("Admin.Sync");
  const tProviders = useTranslations("Admin.providers");
  const instant = useInstant();
  const [provider, setProvider] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isPending, isError } = useSyncRuns({
    /* The ALL sentinel is in none of the three lists, so it drops out as `undefined`. */
    provider: PROVIDER_KEYS.find((option) => option === provider),
    kind: KINDS.find((option) => option === kind),
    status: STATUSES.find((option) => option === status),
    page,
  });

  /* Any filter change resets the pager and closes an open detail row, which belongs to a
   * run that may not be in the next result set. */
  const onFilterChange = (set: (next: string) => void) => (next: string) => {
    set(next);
    setPage(1);
    setExpanded(null);
  };

  const at = (value: string | null) =>
    value ? instant(value, { dateStyle: "short", timeStyle: "short" }) : t("pending");

  const counts = (run: SyncRunRow) =>
    [
      t("counts.created", { count: run.createdCount }),
      t("counts.updated", { count: run.updatedCount }),
      t("counts.skipped", { count: run.skippedCount }),
      t("counts.failed", { count: run.failedCount }),
    ].join(" · ");

  const messageRow = (message: string) => (
    <TableRow>
      <TableCell
        colSpan={COLUMN_COUNT}
        className="text-center text-sm font-medium text-natural-500"
      >
        {message}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="min-w-0 flex-1">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.provider")}
            value={provider}
            onValueChange={onFilterChange(setProvider)}
            options={[
              { value: ALL, label: t("filters.allProviders") },
              ...PROVIDER_KEYS.map((key) => ({ value: key, label: tProviders(key) })),
            ]}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.kind")}
            value={kind}
            onValueChange={onFilterChange(setKind)}
            options={[
              { value: ALL, label: t("filters.allKinds") },
              ...KINDS.map((value) => ({ value, label: t(`kind.${value}`) })),
            ]}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.status")}
            value={status}
            onValueChange={onFilterChange(setStatus)}
            options={[
              { value: ALL, label: t("filters.allStatuses") },
              ...STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
            ]}
          />
        </div>
      </div>

      <Table className="min-w-200 [&_td]:px-3 [&_td]:py-3 [&_th]:h-12.5 [&_th]:px-3 [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.provider")}</TableHead>
            <TableHead>{t("table.kind")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
            <TableHead>{t("table.results")}</TableHead>
            <TableHead className="w-20">{t("table.errors")}</TableHead>
            <TableHead>{t("table.started")}</TableHead>
            <TableHead>{t("table.finished")}</TableHead>
            <TableHead className="w-20 text-right">{t("table.details")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending
            ? Array.from({ length: SKELETON_ROWS }, (_, row) => (
                <TableRow key={row}>
                  {SKELETON_WIDTHS.map((width, column) => (
                    <TableCell key={column}>
                      <Skeleton className={`h-4 rounded-md ${width}`} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : isError
              ? messageRow(t("error"))
              : data.items.length === 0
                ? messageRow(t("empty"))
                : data.items.flatMap((run) => {
                    const isOpen = expanded === run.syncRunId;
                    const providerKey = toProviderKey(run.provider);

                    return [
                      <TableRow key={run.syncRunId}>
                        <TableCell className="whitespace-nowrap">{run.providerName}</TableCell>
                        <TableCell className="whitespace-nowrap">{t(`kind.${run.kind}`)}</TableCell>
                        <TableCell>
                          <Chip variant={STATUS_VARIANTS[run.status]}>
                            {t(`status.${run.status}`)}
                          </Chip>
                        </TableCell>
                        <TableCell className="max-w-52 text-sm">{counts(run)}</TableCell>
                        <TableCell className="whitespace-nowrap">{run.errorCount}</TableCell>
                        <TableCell className="whitespace-nowrap">{at(run.startedAt)}</TableCell>
                        <TableCell className="whitespace-nowrap">{at(run.finishedAt)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="subtle"
                            size="icon-md"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? t("details.hide") : t("details.show")}
                            title={isOpen ? t("details.hide") : t("details.show")}
                            className="[&_svg]:size-4"
                            onClick={() => setExpanded(isOpen ? null : run.syncRunId)}
                          >
                            {isOpen ? <ChevronUp /> : <ChevronDown />}
                          </Button>
                        </TableCell>
                      </TableRow>,
                      isOpen ? (
                        <TableRow key={`${run.syncRunId}-details`}>
                          <TableCell colSpan={COLUMN_COUNT} className="bg-natural-50">
                            {providerKey ? (
                              <SyncRunErrors syncRunId={run.syncRunId} provider={providerKey} />
                            ) : (
                              <p className="text-sm font-medium text-natural-500">
                                {t("details.unavailable")}
                              </p>
                            )}
                          </TableCell>
                        </TableRow>
                      ) : null,
                    ];
                  })}
        </TableBody>
      </Table>

      {data && data.pagination.totalPages > 1 ? (
        <div className="flex justify-center md:justify-start">
          <PaginationControl
            page={page}
            onPageChange={setPage}
            pageCount={data.pagination.totalPages}
            summary={false}
          />
        </div>
      ) : null}
    </div>
  );
}
