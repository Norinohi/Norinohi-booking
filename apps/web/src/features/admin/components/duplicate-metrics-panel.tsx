"use client";

import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@yacht-charter/ui/components/data-display/table";
import { ChevronDown } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { useDuplicateMetrics } from "../hooks/use-duplicates";
import type { DuplicateConfidenceBand, DuplicateMetricRow } from "../types";

/*
 * DuplicateMetricsPanel — how often each matcher rule has been right, above the review queue.
 *
 * The question auto-merge turns on, and the queue's own counts cannot answer it: they say how
 * much work is left, not how often the proposal was correct. Collapsed by default because it is
 * a periodic read rather than something a reviewer works from, with the sample size in the
 * header so the size of the claim is visible before anyone opens it.
 *
 * Nothing here is actionable on purpose. Every merge is still a person's decision.
 */

const SKELETON_ROWS = 4;
const COLUMN_COUNT = 7;

/** Band order, strongest first, so the rows read down the same scale the queue filters on. */
const BAND_ORDER: readonly DuplicateConfidenceBand[] = ["high", "medium", "low", "unknown"];

export default function DuplicateMetricsPanel({
  matchTypeLabel,
}: {
  /** Supplied by the screen, which owns the list of rules this build ships labels for. */
  matchTypeLabel: (value: string) => string;
}) {
  const t = useTranslations("Admin.Duplicates");
  const format = useFormatter();
  const [open, setOpen] = useState(false);

  const { data, isPending, isError } = useDuplicateMetrics();

  /*
   * Grouped by rule rather than left in whatever order the aggregate returned, because the
   * comparison anybody makes here is between bands of one rule: a rule that is right at 95%
   * confidence and wrong at 70% is the shape auto-merge would have to be cut around.
   */
  const rows = [...(data?.rows ?? [])].sort((left, right) => {
    if (left.matchedOn !== right.matchedOn) return left.matchedOn < right.matchedOn ? -1 : 1;
    return BAND_ORDER.indexOf(left.band) - BAND_ORDER.indexOf(right.band);
  });

  /* Null until a bucket has a decided pair in it. Rendered as its own sentence rather than as
     0%, which would read as a rule that is always wrong instead of one nobody has judged. */
  const precisionLabel = (row: DuplicateMetricRow) =>
    row.precision === null
      ? t("metrics.noSample")
      : format.number(row.precision, { style: "percent", maximumFractionDigits: 0 });

  const messageRow = (text: string) => (
    <TableRow>
      <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center text-natural-500">
        {text}
      </TableCell>
    </TableRow>
  );

  return (
    <section className="rounded-lg border border-natural-100">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex flex-col gap-0.5">
          <span className="text-sm leading-[1.3] font-bold text-foreground">
            {t("metrics.title")}
          </span>
          <span className="text-sm leading-[1.3] font-medium text-natural-500">
            {data ? t("metrics.decided", { count: data.decided }) : t("metrics.subtitle")}
          </span>
        </span>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 text-natural-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div hidden={!open} className="border-t border-natural-50 p-4">
        <div className="overflow-x-auto">
          <Table className="min-w-200 [&_td]:py-3 [&_th]:h-12.5 [&_th]:py-0">
            <TableHeader>
              <TableRow>
                <TableHead>{t("metrics.table.rule")}</TableHead>
                <TableHead>{t("metrics.table.band")}</TableHead>
                <TableHead>{t("metrics.table.proposed")}</TableHead>
                <TableHead>{t("metrics.table.confirmed")}</TableHead>
                <TableHead>{t("metrics.table.rejected")}</TableHead>
                <TableHead>{t("metrics.table.undone")}</TableHead>
                <TableHead>{t("metrics.table.precision")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending
                ? Array.from({ length: SKELETON_ROWS }, (_, row) => (
                    <TableRow key={row}>
                      {Array.from({ length: COLUMN_COUNT }, (_, column) => (
                        <TableCell key={column}>
                          <Skeleton className="h-4 w-20 rounded-md" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : isError
                  ? messageRow(t("metrics.error"))
                  : rows.length === 0
                    ? messageRow(t("metrics.empty"))
                    : rows.map((row) => (
                        <TableRow key={`${row.matchedOn}:${row.band}`}>
                          <TableCell>{matchTypeLabel(row.matchedOn)}</TableCell>
                          <TableCell>{t(`confidenceBand.${row.band}`)}</TableCell>
                          <TableCell>{row.proposed}</TableCell>
                          <TableCell>{row.confirmed}</TableCell>
                          <TableCell>{row.rejected}</TableCell>
                          <TableCell>{row.undone}</TableCell>
                          <TableCell>{precisionLabel(row)}</TableCell>
                        </TableRow>
                      ))}
            </TableBody>
          </Table>
        </div>

        <p className="pt-3 text-sm leading-[1.3] font-medium text-natural-500">
          {t("metrics.note")}
        </p>
      </div>
    </section>
  );
}
