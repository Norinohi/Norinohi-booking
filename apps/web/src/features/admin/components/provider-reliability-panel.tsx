"use client";

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
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { useProviderReliability } from "../hooks/use-sync-runs";
import { toProviderKey, type ProviderReliabilityRow } from "../types";

/*
 * ProviderReliabilityPanel — how each vendor has been answering quote requests, on /sync.
 *
 * Beside the import history because it answers the neighbouring question: that table says
 * whether a vendor's catalogue arrived, this one says whether the vendor answers when a visitor
 * is standing at the checkout. Every figure comes from `quote_offer_attempt`, which has recorded
 * one row per vendor asked since multi-offer selection shipped.
 *
 * Nothing in the sale reads these numbers. That is deliberate: the client agreed reliability
 * should break a tie between two equal offers, and the measurement has to be in front of people
 * before it is allowed to move a sale.
 */

const WINDOWS = [7, 30, 90] as const;
const COLUMN_COUNT = 6;
const SKELETON_ROWS = 2;

export default function ProviderReliabilityPanel() {
  const t = useTranslations("Admin.Sync.reliability");
  const tProviders = useTranslations("Admin.providers");
  const format = useFormatter();
  const [windowDays, setWindowDays] = useState<number>(30);

  const { data, isPending, isError } = useProviderReliability(windowDays);

  /** The stored provider code, which may name a connector this build no longer ships. */
  const providerLabel = (code: string) => {
    const key = toProviderKey(code);
    return key ? tProviders(key) : code;
  };

  /* Null until a vendor has been reached about something. Said in words rather than as 0%,
     which would read as a connector that fails everything instead of one nobody asked. */
  const ratioLabel = (row: ProviderReliabilityRow) =>
    row.successRatio === null
      ? t("noSample")
      : format.number(row.successRatio, { style: "percent", maximumFractionDigits: 1 });

  const latencyLabel = (row: ProviderReliabilityRow) =>
    row.p50LatencyMs === null ? t("noSample") : t("milliseconds", { value: row.p50LatencyMs });

  const messageRow = (text: string) => (
    <TableRow>
      <TableCell colSpan={COLUMN_COUNT} className="py-8 text-center text-natural-500">
        {text}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-base leading-[1.3] font-bold text-foreground">{t("title")}</h2>
          <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("subtitle")}</p>
        </div>
        <div className="min-w-0 sm:w-56">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("window")}
            value={String(windowDays)}
            onValueChange={(next) => setWindowDays(Number(next))}
            options={WINDOWS.map((days) => ({
              value: String(days),
              label: t("windowValue", { days }),
            }))}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <Table className="min-w-200 [&_td]:py-3 [&_th]:h-12.5 [&_th]:py-0">
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.provider")}</TableHead>
              <TableHead>{t("table.asked")}</TableHead>
              <TableHead>{t("table.answered")}</TableHead>
              <TableHead>{t("table.failed")}</TableHead>
              <TableHead>{t("table.successRatio")}</TableHead>
              <TableHead>{t("table.latency")}</TableHead>
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
                ? messageRow(t("error"))
                : data.rows.length === 0
                  ? messageRow(t("empty"))
                  : data.rows.map((row) => (
                      <TableRow key={row.provider}>
                        <TableCell>{providerLabel(row.provider)}</TableCell>
                        <TableCell>{row.asked}</TableCell>
                        <TableCell>{row.answered}</TableCell>
                        <TableCell>{row.failed}</TableCell>
                        <TableCell>{ratioLabel(row)}</TableCell>
                        <TableCell>{latencyLabel(row)}</TableCell>
                      </TableRow>
                    ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("note")}</p>
    </div>
  );
}
