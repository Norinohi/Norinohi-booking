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
import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";

import { useAmount } from "../hooks/use-amount";
import { useBookingQueue } from "../hooks/use-payments";
import type { BookingStatus } from "../types";

/*
 * BookingsTable — every booking on the platform, newest first.
 *
 * The other booking surfaces are queues: the refund tab is the one status that means money is
 * owed back, and the inbox reaches a booking only through the question asked about it. Neither
 * answers "the customer is on the phone quoting NB-4VSD3VE6" — that is what this is for, and
 * why search comes before any filter here.
 *
 * Excluded bookings stay out until asked for, matching the API default: the queues and the
 * money totals are the real book of business, and a test booking in this list would be counted
 * by eye even where no total counts it.
 */

/* Same sentinel the other admin filters use: "" would blank the Select trigger. */
const ALL = "all";

/* Every state a booking can be in, in lifecycle order rather than alphabetically: staff scan
   this list looking for a stage, not for a word. */
const STATUSES: readonly BookingStatus[] = [
  "DRAFT",
  "QUOTED",
  "OPTION_PENDING",
  "OPTION_HELD",
  "OPTION_EXPIRED",
  "QUOTE_EXPIRED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "CONFIRMING",
  "CONFIRMED",
  "PROVIDER_REJECTED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
];

const STATUS_VARIANTS = {
  DRAFT: "neutral",
  QUOTED: "neutral",
  OPTION_PENDING: "warning",
  OPTION_HELD: "warning",
  OPTION_EXPIRED: "neutral",
  QUOTE_EXPIRED: "neutral",
  PAYMENT_PENDING: "warning",
  PAYMENT_FAILED: "error",
  CONFIRMING: "warning",
  CONFIRMED: "success",
  PROVIDER_REJECTED: "error",
  CANCELLED: "neutral",
  REFUND_PENDING: "error",
  REFUNDED: "success",
} as const satisfies Record<BookingStatus, string>;

const COLUMN_COUNT = 7;
const SKELETON_ROWS = 8;
const SKELETON_WIDTHS = ["w-24", "w-32", "w-40", "w-28", "w-20", "w-20", "w-20"];

export default function BookingsTable() {
  const t = useTranslations("Admin.Bookings");
  const format = useFormatter();
  const amount = useAmount();
  const [status, setStatus] = useState(ALL);
  const [query, setQuery] = useState("");
  const [includeExcluded, setIncludeExcluded] = useState(false);
  const [page, setPage] = useState(1);

  /* Narrowed by lookup rather than asserted: the ALL sentinel is in no list, so it comes back
     undefined and the filter drops out — the same shape the audit and inbox filters use. */
  const selectedStatus = STATUSES.find((option) => option === status);

  const { data, isPending, isError } = useBookingQueue({
    status: selectedStatus ? [selectedStatus] : undefined,
    query: query.trim() || undefined,
    includeExcluded,
    page,
  });

  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "short" });

  const onFilterChange =
    <Value,>(set: (next: Value) => void) =>
    (next: Value) => {
      set(next);
      setPage(1);
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
        {/* `className` lands on the input; the bordered field is `fieldClassName`, which is
            what has to match the Select's 48px — see enquiries-table. */}
        <TextField
          containerClassName="min-w-0 md:flex-1"
          fieldClassName="h-12"
          aria-label={t("filters.search")}
          startIcon={<Search />}
          placeholder={t("filters.search")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <div className="min-w-0 md:w-56">
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

      <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-natural-500">
        <Checkbox
          checked={includeExcluded}
          onCheckedChange={(checked) => onFilterChange(setIncludeExcluded)(checked === true)}
        />
        {t("filters.includeExcluded")}
      </label>

      <Table className="min-w-[900px] [&_td]:py-3 [&_th]:h-[50px] [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.reference")}</TableHead>
            <TableHead>{t("table.customer")}</TableHead>
            <TableHead>{t("table.charter")}</TableHead>
            <TableHead>{t("table.dates")}</TableHead>
            <TableHead>{t("table.total")}</TableHead>
            <TableHead>{t("table.collected")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
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
                : data.items.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="whitespace-nowrap">
                        <Link
                          href={`/staff/bookings/${booking.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {booking.reference}
                        </Link>
                        <span className="block text-sm text-natural-500">
                          {t("createdAt", { at: day(booking.createdAt) })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {booking.customerName ?? "—"}
                          </span>
                          {/* The list is where staff pick a booking out of a phone call, and
                              mailing the customer back is often the next move. */}
                          <a
                            href={`mailto:${booking.customerEmail}`}
                            className="text-sm text-natural-500 transition-colors hover:text-brand"
                          >
                            {booking.customerEmail}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-72">
                        <p className="line-clamp-2 text-foreground">{booking.listingTitle}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {day(booking.checkIn)} → {day(booking.checkOut)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{amount(booking.total)}</TableCell>
                      <TableCell className="whitespace-nowrap">{amount(booking.paid)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip variant={STATUS_VARIANTS[booking.status]}>
                            {t(`status.${booking.status}`)}
                          </Chip>
                          {/* Only shown once the filter has let these in, so it is always the
                              answer to "why is this row here". */}
                          {booking.excludedAt ? (
                            <Chip variant="outline">{t("excluded")}</Chip>
                          ) : null}
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
