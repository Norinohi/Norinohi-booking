"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
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
import { Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";

import { REFUND_QUEUE_STATUSES } from "../api/queries";
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
  const amount = useAmount();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [refunding, setRefunding] = useState<BookingAdminRow | null>(null);

  const { data, isPending, isError } = useBookingQueue({
    status: REFUND_QUEUE_STATUSES,
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

      <Table className="min-w-[900px] [&_td]:py-3 [&_th]:h-[50px] [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.cancelled")}</TableHead>
            <TableHead>{t("table.customer")}</TableHead>
            <TableHead>{t("table.booking")}</TableHead>
            <TableHead>{t("table.charter")}</TableHead>
            <TableHead>{t("table.collected")}</TableHead>
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
                : data.items.map((booking) => (
                    <TableRow key={booking.id}>
                      <TableCell className="whitespace-nowrap">
                        {booking.cancelledAt ? at(booking.cancelledAt) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {booking.customerName ?? "—"}
                          </span>
                          <a
                            href={`mailto:${booking.customerEmail}`}
                            className="text-sm text-natural-500 transition-colors hover:text-brand"
                          >
                            {booking.customerEmail}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Link
                          href={`/staff/bookings/${booking.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {booking.reference}
                        </Link>
                        <span className="block text-sm text-natural-500">
                          {booking.listingTitle}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-natural-500">
                        {at(booking.checkIn)} → {at(booking.checkOut)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium text-foreground">{amount(booking.paid)}</span>
                        <span className="block text-sm text-natural-500">
                          {t("ofTotal", { total: amount(booking.total) })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="brand" size="sm" onClick={() => setRefunding(booking)}>
                          {t("actions.refund")}
                        </Button>
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
