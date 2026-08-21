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
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { useAuditLog } from "../hooks/use-audit";
import type { AuditAction, AuditRow } from "../types";

/*
 * AuditTable — the trail on /audit: entity-type, action and id filters over the entries,
 * newest first, each expandable into the before/after it recorded.
 *
 * Every admin mutation writes one of these and nothing edits them afterwards, so this is the
 * only account of who cancelled a booking, who refunded it, and which two listings a merge
 * combined. The payloads are rendered as the JSON they are: they carry whatever columns the
 * writing service thought mattered, and summarising them here would drop the one field that
 * turns out to matter later.
 */

/* Same sentinel the sync filters use: "" would blank the Select trigger. */
const ALL = "all";

/** The entity types services actually write, so the filter offers no dead option. */
const ENTITY_TYPES = [
  "booking",
  "booking_enquiry",
  "discount",
  "invoice_request",
  "lead",
  "listing",
  "listing_duplicate_candidate",
  "maintenance",
] as const;

const ACTIONS: readonly AuditAction[] = [
  "create",
  "update",
  "delete",
  "sync",
  "merge",
  "price_adjustment",
];

const ACTION_VARIANTS = {
  create: "success",
  update: "brand",
  delete: "error",
  sync: "neutral",
  merge: "warning",
  price_adjustment: "warning",
} as const satisfies Record<AuditAction, string>;

const COLUMN_COUNT = 6;
const SKELETON_ROWS = 5;
const SKELETON_WIDTHS = ["w-28", "w-32", "w-20", "w-24", "w-40", "w-8"];

/** Renders a recorded payload, or nothing when the writer had none to record. */
function Payload({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <p className="text-xs font-semibold text-natural-500">{label}</p>
      <pre className="overflow-x-auto rounded-md bg-card p-3 text-xs leading-4.5 text-foreground">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AuditTable() {
  const t = useTranslations("Admin.Audit");
  const format = useFormatter();
  const [entityType, setEntityType] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [entityId, setEntityId] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isPending, isError } = useAuditLog({
    /* The ALL sentinel is in neither list, so it drops out as `undefined`. */
    entityType: ENTITY_TYPES.find((option) => option === entityType),
    action: ACTIONS.find((option) => option === action),
    entityId: entityId.trim() || undefined,
    page,
  });

  /* A filter change resets the pager and closes an open row, which belongs to an entry that
     may not be in the next result set. */
  const onFilterChange = (set: (next: string) => void) => (next: string) => {
    set(next);
    setPage(1);
    setExpanded(null);
  };

  const actorOf = (row: AuditRow) => row.actor?.name ?? row.actor?.email ?? t("actorGone");

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
            ariaLabel={t("filters.entityType")}
            value={entityType}
            onValueChange={onFilterChange(setEntityType)}
            options={[
              { value: ALL, label: t("filters.allEntities") },
              ...ENTITY_TYPES.map((value) => ({ value, label: t(`entity.${value}`) })),
            ]}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.action")}
            value={action}
            onValueChange={onFilterChange(setAction)}
            options={[
              { value: ALL, label: t("filters.allActions") },
              ...ACTIONS.map((value) => ({ value, label: t(`action.${value}`) })),
            ]}
          />
        </div>
        <div className="min-w-0 flex-1">
          <TextField
            containerClassName="min-w-0"
            fieldClassName="h-12"
            aria-label={t("filters.entityId")}
            startIcon={<Search />}
            placeholder={t("filters.entityIdPlaceholder")}
            value={entityId}
            onChange={(event) => {
              setEntityId(event.target.value);
              setPage(1);
              setExpanded(null);
            }}
          />
        </div>
      </div>

      <Table className="min-w-[900px] [&_td]:py-3 [&_th]:h-[50px] [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.when")}</TableHead>
            <TableHead>{t("table.actor")}</TableHead>
            <TableHead>{t("table.action")}</TableHead>
            <TableHead>{t("table.entity")}</TableHead>
            <TableHead>{t("table.entityId")}</TableHead>
            <TableHead>{t("table.details")}</TableHead>
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
                : data.items.flatMap((row) => {
                    const isOpen = expanded === row.id;
                    /* `entityType` is a plain column, so a service could write one this build
                       ships no label for; the raw value beats a missing-key error. */
                    const entity = ENTITY_TYPES.find((option) => option === row.entityType);

                    return [
                      <TableRow key={row.id}>
                        <TableCell className="whitespace-nowrap">
                          {format.dateTime(new Date(row.createdAt), {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{actorOf(row)}</TableCell>
                        <TableCell>
                          <Chip variant={ACTION_VARIANTS[row.action]}>
                            {t(`action.${row.action}`)}
                          </Chip>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {entity ? t(`entity.${entity}`) : row.entityType}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.entityId}</TableCell>
                        <TableCell>
                          <Button
                            variant="subtle"
                            size="sm"
                            aria-expanded={isOpen}
                            onClick={() => setExpanded(isOpen ? null : row.id)}
                          >
                            {isOpen ? <ChevronUp /> : <ChevronDown />}
                            {isOpen ? t("details.hide") : t("details.show")}
                          </Button>
                        </TableCell>
                      </TableRow>,
                      isOpen ? (
                        <TableRow key={`${row.id}-details`}>
                          <TableCell colSpan={COLUMN_COUNT} className="bg-natural-50">
                            <div className="flex flex-col gap-4 md:flex-row">
                              <Payload label={t("details.before")} value={row.before} />
                              <Payload label={t("details.after")} value={row.after} />
                              <Payload label={t("details.metadata")} value={row.metadata} />
                            </div>
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
