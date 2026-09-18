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
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Search, Undo2 } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";

import { REFUND_QUEUE_STATUSES } from "../api/queries";
import IconAction from "../../shared/components/icon-action";
import { useInstant } from "../../shared/hooks/use-instant";
import { useAmount } from "../hooks/use-amount";
import { useBookingQueue } from "../hooks/use-payments";
import type { BookingAdminRow } from "../types";
import RefundBookingDialog from "./refund-booking-dialog";

/*
 * RefundQueueTable — bookings at REFUND_PENDING: money was collected and is now owed back,
 * because the customer cancelled a confirmed charter or the operator refused after payment.
 *
 * No status filter, unlike the invoice tab. This is not a list to browse by state — it is the
 * one state that means somebody is owed money, and a row leaving it is the work being done.
 * When the table is empty, nothing is outstanding, which is the point.
 */

const COLUMN_COUNT = 6;
const SKELETON_ROWS = 5;
const SKELETON_WIDTHS = ["w-24", "w-32", "w-28", "w-24", "w-20", "w-24"];

export default function RefundQueueTable() {
  const t = useTranslations("Admin.Payments.refunds");
  const format = useFormatter();
  const instant = useInstant();
  const amount = useAmount();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refunding, setRefunding] = useState<BookingAdminRow | null>(null);

  const { data, isPending, isError } = useBookingQueue({
    status: REFUND_QUEUE_STATUSES,
    query: query.trim() || undefined,
    page,
  });

  const at = (value: string) => instant(value, { dateStyle: "short" });
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "short" });

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
      <TextField
        containerClassName="min-w-0 md:max-w-96"
        fieldClassName="h-12"
        value={query}
        startIcon={<Search />}
        placeholder={t("filters.search")}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />

      <Table className="min-w-180 [&_td]:px-3 [&_td]:py-3 [&_th]:h-12.5 [&_th]:px-3 [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">{t("table.cancelled")}</TableHead>
            <TableHead>{t("table.customer")}</TableHead>
            <TableHead className="w-44">{t("table.booking")}</TableHead>
            <TableHead>{t("table.charter")}</TableHead>
            <TableHead className="w-32">{t("table.collected")}</TableHead>
            <TableHead className="w-20 text-right">{t("table.actions")}</TableHead>
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
                        {booking.cancelledAt ? at(booking.cancelledAt) : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="max-w-52 truncate font-medium text-foreground">
                            {booking.customerName ?? "-"}
                          </span>
                          <a
                            href={`mailto:${booking.customerEmail}`}
                            title={booking.customerEmail}
                            className="max-w-52 truncate text-sm text-natural-500 transition-colors hover:text-brand"
                          >
                            {booking.customerEmail}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/staff/bookings/${booking.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {booking.reference}
                        </Link>
                        <span
                          className="block max-w-44 truncate text-sm text-natural-500"
                          title={booking.listingTitle}
                        >
                          {booking.listingTitle}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-natural-500">
                        {day(booking.checkIn)} → {day(booking.checkOut)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium text-foreground">{amount(booking.paid)}</span>
                        <span className="block text-sm text-natural-500">
                          {t("ofTotal", { total: amount(booking.total) })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <IconAction
                            label={t("actions.refund")}
                            primary
                            onClick={() => setRefunding(booking)}
                          >
                            <Undo2 />
                          </IconAction>
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

      <RefundBookingDialog
        booking={refunding}
        open={refunding !== null}
        onOpenChange={(next) => setRefunding(next ? refunding : null)}
      />
    </div>
  );
}
