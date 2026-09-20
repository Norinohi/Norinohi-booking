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
import { ChevronDown, ChevronUp, CircleAlert, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { useInstant } from "../../shared/hooks/use-instant";
import { useAuditLog } from "../hooks/use-audit";
import { errorMetadataOf, type ErrorMetadata } from "../lib/error-metadata";
import type { AuditAction, AuditRow, AuditSource } from "../types";

/*
 * AuditTable - the trail on /audit: entity-type, action, source and id filters over the entries,
 * newest first, each expandable into the before/after it recorded, or for a failure into what
 * failed and why.
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
  "facet_media",
  "facet_media_rank",
  "faq",
  "invoice_request",
  "job",
  "lead",
  "listing",
  "listing_duplicate_candidate",
  "maintenance",
  "marketplace_settings",
  "outbox_message",
  "popular_yachts_config",
  "procedure",
  "provider",
  "provider_commission",
  "stripe_event",
  "suggested_route",
  "suggested_route_featured",
  "suggested_route_stop",
] as const;

const ACTIONS: readonly AuditAction[] = [
  "create",
  "update",
  "delete",
  "sync",
  "merge",
  "price_adjustment",
  "error",
];

const SOURCES: readonly AuditSource[] = [
  "admin_action",
  "server",
  "provider",
  "stripe_webhook",
  "job",
];

const ACTION_VARIANTS = {
  create: "success",
  update: "brand",
  delete: "error",
  sync: "neutral",
  merge: "warning",
  price_adjustment: "warning",
  error: "error",
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

/** A failure's own fields, in the order someone chasing it reads them. */
function ErrorDetails({ metadata }: { metadata: ErrorMetadata }) {
  const t = useTranslations("Admin.Audit");
  const source = SOURCES.find((option) => option === metadata.source);
  const vendor = metadata.provider;

  const fields = [
    { label: t("errorDetails.operation"), value: metadata.operation },
    { label: t("errorDetails.source"), value: source ? t(`source.${source}`) : metadata.source },
    {
      label: t("errorDetails.code"),
      value: [metadata.kind, metadata.code].filter(Boolean).join(" / "),
    },
    { label: t("errorDetails.status"), value: metadata.status?.toString() },
    {
      label: t("errorDetails.vendor"),
      value: vendor
        ? [vendor.errorType, vendor.providerCode, vendor.endpoint].filter(Boolean).join(" / ")
        : undefined,
    },
  ].filter((field) => field.value);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <p className="text-xs font-semibold text-natural-500">{t("errorDetails.title")}</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
        {fields.map((field) => (
          <div key={field.label} className="contents">
            <dt className="font-medium text-natural-500">{field.label}</dt>
            <dd className="font-mono text-xs leading-5 wrap-break-word text-foreground">
              {field.value}
            </dd>
          </div>
        ))}
      </dl>
      {metadata.message ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-natural-500">{t("errorDetails.message")}</p>
          <p className="rounded-md bg-card p-3 text-sm wrap-break-word text-error-600">
            {metadata.errorName ? `${metadata.errorName}: ` : null}
            {metadata.message}
          </p>
        </div>
      ) : null}
      {metadata.causes && metadata.causes.length > 0 ? (
        <Payload label={t("errorDetails.causes")} value={metadata.causes} />
      ) : null}
      <Payload label={t("errorDetails.context")} value={metadata.context} />
    </div>
  );
}

export default function AuditTable() {
  const t = useTranslations("Admin.Audit");
  const instant = useInstant();
  const [entityType, setEntityType] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [source, setSource] = useState(ALL);
  const [entityId, setEntityId] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isPending, isError } = useAuditLog({
    /* The ALL sentinel is in neither list, so it drops out as `undefined`. */
    entityType: ENTITY_TYPES.find((option) => option === entityType),
    action: ACTIONS.find((option) => option === action),
    source: SOURCES.find((option) => option === source),
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

  /* A failure outside a staff action never had an actor; only a staff one can have lost it. */
  const actorOf = (row: AuditRow) => {
    if (row.actor) return row.actor.name ?? row.actor.email ?? t("actorGone");
    const failure = errorMetadataOf(row);
    return failure && failure.source !== "admin_action" ? t("actorSystem") : t("actorGone");
  };

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
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.source")}
            value={source}
            onValueChange={onFilterChange(setSource)}
            options={[
              { value: ALL, label: t("filters.allSources") },
              ...SOURCES.map((value) => ({ value, label: t(`source.${value}`) })),
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

      <Table className="min-w-190 [&_td]:px-3 [&_td]:py-3 [&_th]:h-12.5 [&_th]:px-3 [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">{t("table.when")}</TableHead>
            <TableHead>{t("table.actor")}</TableHead>
            <TableHead>{t("table.action")}</TableHead>
            <TableHead className="w-32">{t("table.entity")}</TableHead>
            <TableHead>{t("table.entityId")}</TableHead>
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
                : data.items.flatMap((row) => {
                    const isOpen = expanded === row.id;
                    /* `entityType` is a plain column, so a service could write one this build
                       ships no label for; the raw value beats a missing-key error. */
                    const entity = ENTITY_TYPES.find((option) => option === row.entityType);
                    const failure = errorMetadataOf(row);
                    const failureSource = SOURCES.find((option) => option === failure?.source);

                    return [
                      <TableRow key={row.id} className={failure ? "bg-error-50/40" : undefined}>
                        <TableCell className="whitespace-nowrap">
                          {instant(row.createdAt, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{actorOf(row)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Chip variant={ACTION_VARIANTS[row.action]}>
                              {failure ? <CircleAlert aria-hidden /> : null}
                              {t(`action.${row.action}`)}
                            </Chip>
                            {failureSource ? (
                              <Chip variant="outline">{t(`source.${failureSource}`)}</Chip>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {entity ? t(`entity.${entity}`) : row.entityType}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <span
                            className="block max-w-48 truncate"
                            title={row.entityId ?? undefined}
                          >
                            {row.entityId}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="subtle"
                            size="icon-md"
                            aria-expanded={isOpen}
                            aria-label={isOpen ? t("details.hide") : t("details.show")}
                            title={isOpen ? t("details.hide") : t("details.show")}
                            className="[&_svg]:size-4"
                            onClick={() => setExpanded(isOpen ? null : row.id)}
                          >
                            {isOpen ? <ChevronUp /> : <ChevronDown />}
                          </Button>
                        </TableCell>
                      </TableRow>,
                      isOpen ? (
                        <TableRow key={`${row.id}-details`}>
                          <TableCell colSpan={COLUMN_COUNT} className="bg-natural-50">
                            {failure ? (
                              <ErrorDetails metadata={failure} />
                            ) : (
                              <div className="flex flex-col gap-4 md:flex-row">
                                <Payload label={t("details.before")} value={row.before} />
                                <Payload label={t("details.after")} value={row.after} />
                                <Payload label={t("details.metadata")} value={row.metadata} />
                              </div>
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
