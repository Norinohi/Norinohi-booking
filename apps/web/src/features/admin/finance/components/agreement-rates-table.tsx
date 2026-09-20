"use client";

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
import { ListFilter, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import IconAction from "../../shared/components/icon-action";
import { useInstant } from "../../shared/hooks/use-instant";
import { SHORT_DAY } from "../../shared/lib/instant";
import { useCommissions, useSetCommissionActive } from "../hooks/use-commissions";
import { COMMISSION_PROVIDERS } from "../lib/providers";
import { type CommissionRow, type CommissionStatus } from "../types";
import CommissionDialog from "./commission-dialog";

/*
 * AgreementRatesTable - the commission rates staff type in.
 *
 * These were the only commission anywhere in the system until the providers' own figures were
 * captured, and they are now the fallback rather than the answer: the vendor states a rate on
 * every offer it prices, per boat and per week, and that is what the quote ranks on. A rate
 * here still covers an offer whose vendor sent none, and is worth keeping for exactly that.
 *
 * The table stays deliberately plain. A commission is a commercial agreement, so the row says
 * what was agreed and with whom, and every change is in the audit log.
 */

const ALL = "all";
const STATUSES: readonly CommissionStatus[] = ["active", "scheduled", "expired", "inactive"];

const STATUS_VARIANTS = {
  active: "success",
  scheduled: "warning",
  expired: "neutral",
  inactive: "neutral",
} as const satisfies Record<CommissionStatus, string>;

const COLUMN_COUNT = 7;
const SKELETON_ROWS = 4;

export default function AgreementRatesTable() {
  const t = useTranslations("Admin.Commissions");
  const tProviders = useTranslations("Admin.providers");
  const format = useFormatter();
  const instant = useInstant();

  const [provider, setProvider] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CommissionRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const setActive = useSetCommissionActive();

  const { data, isPending, isError } = useCommissions({
    /* The ALL sentinel is in neither list, so it drops out as `undefined`. */
    provider: COMMISSION_PROVIDERS.find((option) => option === provider),
    status: STATUSES.find((option) => option === status),
    page,
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (rate: CommissionRow) => {
    setEditing(rate);
    setDialogOpen(true);
  };

  const toggle = (rate: CommissionRow) => {
    setActive.mutate(
      { id: rate.id, active: !rate.active },
      {
        onSuccess: () => toast.success(rate.active ? t("switchedOff") : t("switchedOn")),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  /* Both ends optional, so the cell says which of the four shapes the agreement has rather than
     printing an empty dash the reader has to interpret. */
  const windowLabel = (rate: CommissionRow) => {
    const day = (value: string) => format.dateTime(new Date(value), "dayShort");
    if (rate.startsAt && rate.endsAt) return `${day(rate.startsAt)} - ${day(rate.endsAt)}`;
    if (rate.startsAt) return t("fromDate", { date: day(rate.startsAt) });
    if (rate.endsAt) return t("untilDate", { date: day(rate.endsAt) });
    return t("openEnded");
  };

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
    <>
      <div className="flex flex-col gap-4 p-4 md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="min-w-0 sm:w-56">
              <Select
                className="h-12 min-w-0"
                icon={<ListFilter className="size-4 shrink-0 text-natural-500" />}
                ariaLabel={t("filters.provider")}
                value={provider}
                onValueChange={onFilterChange(setProvider)}
                options={[
                  { value: ALL, label: t("filters.anyProvider") },
                  ...COMMISSION_PROVIDERS.map((key) => ({
                    value: key,
                    label: tProviders(key),
                  })),
                ]}
              />
            </div>
            <div className="min-w-0 sm:w-56">
              <Select
                className="h-12 min-w-0"
                icon={<ListFilter className="size-4 shrink-0 text-natural-500" />}
                ariaLabel={t("filters.status")}
                value={status}
                onValueChange={onFilterChange(setStatus)}
                options={[
                  { value: ALL, label: t("filters.anyStatus") },
                  ...STATUSES.map((key) => ({ value: key, label: t(`status.${key}`) })),
                ]}
              />
            </div>
          </div>

          <Button onClick={openCreate} className="gap-2">
            <Plus className="size-4" />
            {t("add")}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table className="min-w-180 [&_td]:px-3 [&_td]:py-3 [&_th]:h-12.5 [&_th]:px-3 [&_th]:py-0">
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.provider")}</TableHead>
                <TableHead>{t("table.operator")}</TableHead>
                <TableHead className="w-20">{t("table.rate")}</TableHead>
                <TableHead>{t("table.window")}</TableHead>
                <TableHead className="w-24">{t("table.status")}</TableHead>
                <TableHead className="w-28">{t("table.added")}</TableHead>
                <TableHead className="w-24 text-right">{t("table.actions")}</TableHead>
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
                    ? messageRow(
                        provider === ALL && status === ALL ? t("empty") : t("emptyFiltered"),
                      )
                    : data.items.map((rate) => (
                        <TableRow key={rate.id}>
                          <TableCell>{rate.providerName}</TableCell>
                          <TableCell>{rate.operatorName ?? t("allOperators")}</TableCell>
                          <TableCell>
                            {format.number(rate.ratePct / 100, {
                              style: "percent",
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell>{windowLabel(rate)}</TableCell>
                          <TableCell>
                            <Chip variant={STATUS_VARIANTS[rate.status]}>
                              {t(`status.${rate.status}`)}
                            </Chip>
                          </TableCell>
                          <TableCell>{instant(rate.createdAt, SHORT_DAY)}</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <IconAction label={t("edit")} onClick={() => openEdit(rate)}>
                                <Pencil />
                              </IconAction>
                              <IconAction
                                label={rate.active ? t("switchOff") : t("switchOn")}
                                disabled={setActive.isPending}
                                onClick={() => toggle(rate)}
                              >
                                {rate.active ? <PowerOff /> : <Power />}
                              </IconAction>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("note")}</p>

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

      <CommissionDialog rate={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
    </>
  );
}
