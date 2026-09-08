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
import { ListFilter, Plus } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { toast } from "sonner";

import Sidebar from "@/components/layout/sidebar";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { authClient } from "@/lib/auth-client";

import { useCommissions, useSetCommissionActive } from "../hooks/use-commissions";
import { type CommissionRow, type CommissionStatus, type ProviderKey } from "../types";
import CommissionDialog from "./commission-dialog";

/*
 * CommissionsScreen — /commissions: what CharterNavi earns through each vendor.
 *
 * Nothing in the sale reads these rates yet. The client agreed they should break a tie between
 * two offers already equal on price and on obligatory extras, and this screen is how that step
 * gets switched on: it starts working the moment somebody enters a rate, with no release.
 *
 * The table is deliberately plain. A commission is a commercial agreement, so the row says what
 * was agreed and with whom, and every change is in the audit log.
 */

const ALL = "all";
const PROVIDERS: readonly ProviderKey[] = ["booking_manager", "nausys", "mock"];
const STATUSES: readonly CommissionStatus[] = ["active", "scheduled", "expired", "inactive"];

const STATUS_VARIANTS = {
  active: "success",
  scheduled: "warning",
  expired: "neutral",
  inactive: "neutral",
} as const satisfies Record<CommissionStatus, string>;

const COLUMN_COUNT = 7;
const SKELETON_ROWS = 4;

export default function CommissionsScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Admin.Commissions");
  const tProviders = useTranslations("Admin.providers");
  const format = useFormatter();
  const router = useRouter();

  const [provider, setProvider] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CommissionRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const setActive = useSetCommissionActive();

  const { data, isPending, isError } = useCommissions({
    /* The ALL sentinel is in neither list, so it drops out as `undefined`. */
    provider: PROVIDERS.find((option) => option === provider),
    status: STATUSES.find((option) => option === status),
    page,
  });

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

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
    if (rate.startsAt && rate.endsAt) return `${day(rate.startsAt)} – ${day(rate.endsAt)}`;
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
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="px-4 py-6 md:px-13.5">
        <div className="mx-auto grid max-w-349 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[--spacing(83.5)_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            variant="admin"
            defaultActive="commission"
            onLogout={logout}
            className="max-w-none"
          />

          <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
            <div className="flex flex-col gap-2 border-b border-natural-50 px-4 py-5 md:p-5">
              <h1 className="text-lg leading-[1.3] font-bold text-foreground md:text-xl">
                {t("title")}
              </h1>
              <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("subtitle")}</p>
            </div>

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
                        ...PROVIDERS.map((key) => ({ value: key, label: tProviders(key) })),
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
                <Table className="min-w-200 [&_td]:py-3 [&_th]:h-12.5 [&_th]:py-0">
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("table.provider")}</TableHead>
                      <TableHead>{t("table.operator")}</TableHead>
                      <TableHead>{t("table.rate")}</TableHead>
                      <TableHead>{t("table.window")}</TableHead>
                      <TableHead>{t("table.status")}</TableHead>
                      <TableHead>{t("table.added")}</TableHead>
                      <TableHead>{t("table.actions")}</TableHead>
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
                                <TableCell>
                                  {format.dateTime(new Date(rate.createdAt), "dayShort")}
                                </TableCell>
                                <TableCell>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      onClick={() => openEdit(rate)}
                                    >
                                      {t("edit")}
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      size="sm"
                                      disabled={setActive.isPending}
                                      onClick={() => toggle(rate)}
                                    >
                                      {rate.active ? t("switchOff") : t("switchOn")}
                                    </Button>
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
          </section>
        </div>
      </div>

      <CommissionDialog rate={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
