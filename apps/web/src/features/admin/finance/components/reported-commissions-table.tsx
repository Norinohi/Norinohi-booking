"use client";

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
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { ListFilter, Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { useInstant } from "../../shared/hooks/use-instant";
import { SHORT_DAY } from "../../shared/lib/instant";
import { useReportedCommissions } from "../hooks/use-commissions";
import { COMMISSION_PROVIDERS } from "../lib/providers";
import type { ReportedCommissionRow } from "../types";

/*
 * ReportedCommissionsTable - what the vendors themselves say they pay.
 *
 * Both providers state a commission on every offer they price, per boat and per week, and
 * never in the catalogue rate list. The availability sweep stores it and stamps each offer
 * with the last rate seen; this reads that back, grouped by operator, which is the level an
 * agreement is struck at and therefore the level the typed rates on the other tab address.
 *
 * Read-only on purpose. Nothing here is ours to edit: it is a record of what arrived.
 */

/* Sentinel for "All …": a real value, since a falsy selection makes Select show its placeholder. */
const ALL = "all";

const COLUMN_COUNT = 6;
const SKELETON_ROWS = 4;

export default function ReportedCommissionsTable() {
  const t = useTranslations("Admin.Commissions.reported");
  const tProviders = useTranslations("Admin.providers");
  const format = useFormatter();
  const instant = useInstant();

  const [provider, setProvider] = useState(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const { data, isPending, isError } = useReportedCommissions({
    provider: COMMISSION_PROVIDERS.find((option) => option === provider),
    query: query.trim() || undefined,
    page,
  });

  const pct = (value: number) =>
    format.number(value / 100, { style: "percent", maximumFractionDigits: 2 });

  /* One figure where the operator charges one rate, a range where it does not. A spread is
     the case no single typed rate can express, so it is shown rather than averaged away. */
  const rateLabel = (row: ReportedCommissionRow) =>
    row.minPct === row.maxPct ? pct(row.commonPct) : `${pct(row.minPct)} - ${pct(row.maxPct)}`;

  const messageRow = (text: string) => (
    <TableRow>
      <TableCell colSpan={COLUMN_COUNT} className="py-10 text-center text-natural-500">
        {text}
      </TableCell>
    </TableRow>
  );

  const onFilterChange = (set: (next: string) => void) => (next: string) => {
    set(next);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row">
        <TextField
          containerClassName="min-w-0 sm:max-w-72"
          fieldClassName="h-12"
          value={query}
          startIcon={<Search />}
          placeholder={t("filters.search")}
          onChange={(event) => onFilterChange(setQuery)(event.target.value)}
        />
        <div className="min-w-0 sm:w-56">
          <Select
            className="h-12 min-w-0"
            icon={<ListFilter className="size-4 shrink-0 text-natural-500" />}
            ariaLabel={t("filters.provider")}
            value={provider}
            onValueChange={onFilterChange(setProvider)}
            options={[
              { value: ALL, label: t("filters.anyProvider") },
              ...COMMISSION_PROVIDERS.map((key) => ({ value: key, label: tProviders(key) })),
            ]}
          />
        </div>
      </div>

      {/*
        Whether this screen can be trusted yet. A rate arrives only on an offer for a period the
        sweep has priced, so an operator it has not reached carries none - which reads exactly
        like one that pays nothing until this line says how much of the fleet has answered.
      */}
      {data ? (
        <p className="text-sm leading-[1.3] font-medium text-natural-500">
          {t("coverage", {
            rated: data.coverage.offersWithRate,
            total: data.coverage.activeOffers,
          })}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <Table className="min-w-180 [&_td]:px-3 [&_td]:py-3 [&_th]:h-12.5 [&_th]:px-3 [&_th]:py-0">
          <TableHeader>
            <TableRow>
              <TableHead>{t("table.operator")}</TableHead>
              <TableHead className="w-28">{t("table.provider")}</TableHead>
              <TableHead className="w-20">{t("table.offers")}</TableHead>
              <TableHead className="w-32">{t("table.rate")}</TableHead>
              <TableHead className="w-32">{t("table.agreement")}</TableHead>
              <TableHead className="w-28">{t("table.lastSeen")}</TableHead>
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
                : data.items.length === 0
                  ? messageRow(provider === ALL && !query.trim() ? t("empty") : t("emptyFiltered"))
                  : data.items.map((row) => (
                      <TableRow key={`${row.provider}|${row.operatorId ?? ""}`}>
                        <TableCell>{row.operatorName ?? t("noOperator")}</TableCell>
                        <TableCell>{row.providerName}</TableCell>
                        <TableCell>{row.offerCount}</TableCell>
                        <TableCell className="font-medium text-foreground">
                          {rateLabel(row)}
                          {row.minPct === row.maxPct ? null : (
                            <span className="block text-sm font-normal text-natural-500">
                              {t("mostly", { rate: pct(row.commonPct) })}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {row.agreementPct === null ? (
                            <span className="text-natural-500">{t("noAgreement")}</span>
                          ) : (
                            <div className="flex flex-col items-start gap-1">
                              <span>{pct(row.agreementPct)}</span>
                              {/* The typed rate is the fallback, so it disagreeing with what
                                  arrives is not an error - but it is the thing worth seeing. */}
                              {row.agreementPct === row.commonPct ? null : (
                                <Chip variant="warning">{t("differs")}</Chip>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.lastSeenAt ? instant(row.lastSeenAt, SHORT_DAY) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
          </TableBody>
        </Table>
      </div>

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
