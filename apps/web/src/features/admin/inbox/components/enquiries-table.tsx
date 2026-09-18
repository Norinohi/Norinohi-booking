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
import { MessageSquareReply, RotateCcw, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";

import IconAction from "../../shared/components/icon-action";
import { useInstant } from "../../shared/hooks/use-instant";
import { useEnquiries, useSetEnquiryStatus } from "../hooks/use-inbox";
import type { EnquiryRow, EnquiryStatus } from "../types";
import AnswerEnquiryDialog from "./answer-enquiry-dialog";

/*
 * EnquiriesTable — the questions customers asked about bookings they already hold, which until
 * now were written to `booking_enquiry` and read by nobody. Open ones first by default, because
 * this is a queue to work through rather than a history to browse.
 */

/* Sentinel for "All …": a real value, since a falsy selection makes Select show its placeholder. */
const ALL = "all";

const STATUSES: readonly EnquiryStatus[] = ["open", "answered", "closed"];

const STATUS_VARIANTS = {
  open: "warning",
  answered: "brand",
  closed: "success",
} as const satisfies Record<EnquiryStatus, string>;

const COLUMN_COUNT = 6;
const SKELETON_ROWS = 5;
const SKELETON_WIDTHS = ["w-24", "w-28", "w-3/4", "w-16", "w-24", "w-20"];

export default function EnquiriesTable() {
  const t = useTranslations("Admin.Inbox.enquiries");
  const instant = useInstant();
  const [status, setStatus] = useState<string>("open");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [answering, setAnswering] = useState<EnquiryRow | null>(null);

  const setStatusMutation = useSetEnquiryStatus();

  const { data, isPending, isError } = useEnquiries({
    status: STATUSES.find((option) => option === status),
    query: query.trim() || undefined,
    page,
  });

  const at = (value: string) => instant(value, { dateStyle: "short" });

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
        <div className="min-w-0 md:w-56">
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

      <Table className="min-w-190 [&_td]:px-3 [&_td]:py-3 [&_th]:h-12.5 [&_th]:px-3 [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">{t("table.received")}</TableHead>
            <TableHead>{t("table.customer")}</TableHead>
            <TableHead>{t("table.question")}</TableHead>
            <TableHead className="w-24">{t("table.status")}</TableHead>
            <TableHead className="w-44">{t("table.booking")}</TableHead>
            <TableHead className="w-24 text-right">{t("table.actions")}</TableHead>
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
                : data.items.map((enquiry) => (
                    <TableRow key={enquiry.id}>
                      <TableCell className="whitespace-nowrap">{at(enquiry.createdAt)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {enquiry.customerName}
                          </span>
                          {/* Staff answer from here, but a phone call or a plain reply is
                              sometimes faster — so the address stays one click away. */}
                          <a
                            href={`mailto:${enquiry.customerEmail}`}
                            className="text-sm text-natural-500 transition-colors hover:text-brand"
                          >
                            {enquiry.customerEmail}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-80">
                        <p className="line-clamp-2 text-foreground">{enquiry.question}</p>
                        {enquiry.answer ? (
                          <p className="line-clamp-1 text-sm text-natural-500">
                            {t("answered", { answer: enquiry.answer })}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Chip variant={STATUS_VARIANTS[enquiry.status]}>
                          {t(`status.${enquiry.status}`)}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/staff/bookings/${enquiry.bookingId}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {enquiry.reference}
                        </Link>
                        {enquiry.listingSlug ? (
                          <Link
                            href={`/yachts/${enquiry.listingSlug}`}
                            target="_blank"
                            rel="noreferrer"
                            title={enquiry.listingTitle}
                            className="block max-w-44 truncate text-sm text-brand hover:underline"
                          >
                            {enquiry.listingTitle}
                          </Link>
                        ) : (
                          <span
                            className="block max-w-44 truncate text-sm text-natural-500"
                            title={enquiry.listingTitle}
                          >
                            {enquiry.listingTitle}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <IconAction
                            label={enquiry.answer ? t("actions.replyAgain") : t("actions.reply")}
                            primary
                            onClick={() => setAnswering(enquiry)}
                          >
                            <MessageSquareReply />
                          </IconAction>
                          {enquiry.status === "closed" ? (
                            <IconAction
                              label={t("actions.reopen")}
                              disabled={setStatusMutation.isPending}
                              onClick={() =>
                                setStatusMutation.mutate({ id: enquiry.id, status: "open" })
                              }
                            >
                              <RotateCcw />
                            </IconAction>
                          ) : (
                            <IconAction
                              label={t("actions.close")}
                              disabled={setStatusMutation.isPending}
                              onClick={() =>
                                setStatusMutation.mutate({ id: enquiry.id, status: "closed" })
                              }
                            >
                              <X />
                            </IconAction>
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

      <AnswerEnquiryDialog
        enquiry={answering}
        open={answering !== null}
        onOpenChange={(next) => setAnswering(next ? answering : null)}
      />
    </div>
  );
}
