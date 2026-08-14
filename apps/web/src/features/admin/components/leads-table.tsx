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
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { useLeads, useSetLeadStatus } from "../hooks/use-inbox";
import type { LeadKind, LeadStatus } from "../types";

/*
 * LeadsTable — the pre-booking funnel: Request Quote on a yacht, Contact a charter expert, and
 * Get Consultation. `admin.lead.list` has existed since these forms were built; this is the
 * first screen to read it. New ones first, since a lead cools fast.
 */

const ALL = "all";

const STATUSES: readonly LeadStatus[] = ["new", "contacted", "closed"];
const KINDS: readonly LeadKind[] = ["quote_request", "charter_expert", "consultation"];

const STATUS_VARIANTS = {
  new: "warning",
  contacted: "brand",
  closed: "success",
} as const satisfies Record<LeadStatus, string>;

const COLUMN_COUNT = 6;
const SKELETON_ROWS = 5;
const SKELETON_WIDTHS = ["w-20", "w-28", "w-24", "w-3/4", "w-16", "w-24"];

export default function LeadsTable() {
  const t = useTranslations("Admin.Inbox.leads");
  const format = useFormatter();
  const [status, setStatus] = useState<string>("new");
  const [kind, setKind] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const setStatusMutation = useSetLeadStatus();

  const { data, isPending, isError } = useLeads({
    status: STATUSES.find((option) => option === status),
    kind: KINDS.find((option) => option === kind),
    query: query.trim() || undefined,
    page,
  });

  const at = (value: string) => format.dateTime(new Date(value), { dateStyle: "short" });

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
        <div className="min-w-0 md:w-44">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.status")}
            value={status}
            onValueChange={(next) => {
              setStatus(next);
              setPage(1);
            }}
            options={[
              { value: ALL, label: t("filters.allStatuses") },
              ...STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
            ]}
          />
        </div>
        <div className="min-w-0 md:w-52">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.kind")}
            value={kind}
            onValueChange={(next) => {
              setKind(next);
              setPage(1);
            }}
            options={[
              { value: ALL, label: t("filters.allKinds") },
              ...KINDS.map((value) => ({ value, label: t(`kind.${value}`) })),
            ]}
          />
        </div>
        {/* `className` lands on the input; the bordered field is `fieldClassName`, which is
            what has to match the Select's 48px — see manage-prices-table. */}
        <TextField
          containerClassName="min-w-0 md:flex-1"
          fieldClassName="h-12"
          value={query}
          startIcon={<Search />}
          placeholder={t("filters.search")}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </div>

      <Table className="min-w-[900px] [&_td]:py-3 [&_th]:h-[50px] [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.received")}</TableHead>
            <TableHead>{t("table.from")}</TableHead>
            <TableHead>{t("table.kind")}</TableHead>
            <TableHead>{t("table.message")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
            <TableHead>{t("table.actions")}</TableHead>
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
                : data.items.map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="whitespace-nowrap">{at(lead.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{lead.name}</span>
                          {/* A lead is answered by writing to them, so the address is the action. */}
                          <a
                            href={`mailto:${lead.email}`}
                            className="text-sm text-natural-500 transition-colors hover:text-brand"
                          >
                            {lead.email}
                          </a>
                          {lead.phone ? (
                            <a
                              href={`tel:${lead.phone}`}
                              className="text-sm text-natural-500 transition-colors hover:text-brand"
                            >
                              {lead.phone}
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="block">{t(`kind.${lead.kind}`)}</span>
                        {lead.listingTitle ? (
                          <span className="block text-sm text-natural-500">
                            {lead.listingTitle}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-96">
                        <p className="line-clamp-2 text-foreground">{lead.message ?? "—"}</p>
                      </TableCell>
                      <TableCell>
                        <Chip variant={STATUS_VARIANTS[lead.status]}>
                          {t(`status.${lead.status}`)}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {lead.status === "new" ? (
                            <Button
                              variant="brand"
                              size="sm"
                              disabled={setStatusMutation.isPending}
                              onClick={() =>
                                setStatusMutation.mutate({ id: lead.id, status: "contacted" })
                              }
                            >
                              {t("actions.contacted")}
                            </Button>
                          ) : null}
                          {lead.status === "closed" ? (
                            <Button
                              variant="subtle"
                              size="sm"
                              disabled={setStatusMutation.isPending}
                              onClick={() =>
                                setStatusMutation.mutate({ id: lead.id, status: "new" })
                              }
                            >
                              {t("actions.reopen")}
                            </Button>
                          ) : (
                            <Button
                              variant="subtle"
                              size="sm"
                              disabled={setStatusMutation.isPending}
                              onClick={() =>
                                setStatusMutation.mutate({ id: lead.id, status: "closed" })
                              }
                            >
                              {t("actions.close")}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
