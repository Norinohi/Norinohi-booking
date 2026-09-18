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
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";

import { CircleCheck, Ban } from "lucide-react";
import IconAction from "../../shared/components/icon-action";
import { useInstant } from "../../shared/hooks/use-instant";
import { useAmount } from "../hooks/use-amount";
import { useInvoices } from "../hooks/use-payments";
import type { InvoiceRow, InvoiceStatus } from "../types";
import SettleInvoiceDialog from "./settle-invoice-dialog";
import WithdrawInvoiceDialog from "./withdraw-invoice-dialog";

/*
 * InvoiceRequestsTable — customers who chose "Request invoice" instead of paying by card. Their
 * bookings sit at PAYMENT_PENDING holding an operator option, and until this screen existed the
 * rows were written and read by nobody. Pending first by default, because it is a queue to work
 * through and every day one sits here is a day a yacht is held for money that has not arrived.
 */

/* Sentinel for "All …": a real value, since a falsy selection makes Select show its placeholder. */
const ALL = "all";

const STATUSES: readonly InvoiceStatus[] = ["pending", "sent", "paid", "cancelled"];

const STATUS_VARIANTS = {
  pending: "warning",
  sent: "brand",
  paid: "success",
  cancelled: "neutral",
} as const satisfies Record<InvoiceStatus, string>;

const COLUMN_COUNT = 7;
const SKELETON_ROWS = 5;
const SKELETON_WIDTHS = ["w-24", "w-28", "w-32", "w-20", "w-20", "w-16", "w-28"];

export default function InvoiceRequestsTable() {
  const t = useTranslations("Admin.Payments.invoices");
  const instant = useInstant();
  const amount = useAmount();
  const [status, setStatus] = useState<string>("pending");
  const [page, setPage] = useState(1);
  const [settling, setSettling] = useState<InvoiceRow | null>(null);
  const [withdrawing, setWithdrawing] = useState<InvoiceRow | null>(null);

  const { data, isPending, isError } = useInvoices({
    status: STATUSES.find((option) => option === status),
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
      <div className="md:w-56">
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

      <Table className="min-w-190 [&_td]:px-3 [&_td]:py-3 [&_th]:h-12.5 [&_th]:px-3 [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead className="w-32">{t("table.issued")}</TableHead>
            <TableHead className="w-28">{t("table.invoice")}</TableHead>
            <TableHead>{t("table.customer")}</TableHead>
            <TableHead className="w-44">{t("table.booking")}</TableHead>
            <TableHead className="w-28">{t("table.amount")}</TableHead>
            <TableHead className="w-24">{t("table.status")}</TableHead>
            <TableHead className="w-28 text-right">{t("table.actions")}</TableHead>
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
                : data.items.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="whitespace-nowrap">
                        <span className="block">{at(invoice.issuedAt)}</span>
                        {/* An overdue transfer is the whole reason to look at this table, so
                            the due date is called out rather than left for staff to compare. */}
                        <span
                          className={
                            invoice.status === "pending" && new Date(invoice.dueAt) < new Date()
                              ? "block text-sm font-semibold text-error-600"
                              : "block text-sm text-natural-500"
                          }
                        >
                          {t("due", { date: at(invoice.dueAt) })}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-foreground">
                        {invoice.number}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="max-w-52 truncate font-medium text-foreground">
                            {invoice.billingName ?? invoice.guestName ?? "-"}
                          </span>
                          <a
                            href={`mailto:${invoice.billingEmail}`}
                            title={invoice.billingEmail}
                            className="max-w-52 truncate text-sm text-natural-500 transition-colors hover:text-brand"
                          >
                            {invoice.billingEmail}
                          </a>
                          {invoice.companyName ? (
                            <span
                              className="max-w-52 truncate text-sm text-natural-500"
                              title={invoice.companyName}
                            >
                              {invoice.companyName}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/staff/bookings/${invoice.bookingId}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {invoice.reference}
                        </Link>
                        <span
                          className="block max-w-44 truncate text-sm text-natural-500"
                          title={invoice.listingTitle}
                        >
                          {invoice.listingTitle}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-foreground">
                        {amount(invoice.amount)}
                      </TableCell>
                      <TableCell>
                        <Chip variant={STATUS_VARIANTS[invoice.status]}>
                          {t(`status.${invoice.status}`)}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        {invoice.status === "pending" || invoice.status === "sent" ? (
                          <div className="flex items-center justify-end gap-1">
                            <IconAction
                              label={t("actions.settle")}
                              primary
                              onClick={() => setSettling(invoice)}
                            >
                              <CircleCheck />
                            </IconAction>
                            <IconAction
                              label={t("actions.withdraw")}
                              destructive
                              onClick={() => setWithdrawing(invoice)}
                            >
                              <Ban />
                            </IconAction>
                          </div>
                        ) : (
                          <span className="block text-right text-sm text-natural-500">
                            {invoice.settledAt
                              ? t("settledAt", { date: at(invoice.settledAt) })
                              : "-"}
                          </span>
                        )}
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

      <SettleInvoiceDialog
        invoice={settling}
        open={settling !== null}
        onOpenChange={(next) => setSettling(next ? settling : null)}
      />
      <WithdrawInvoiceDialog
        invoice={withdrawing}
        open={withdrawing !== null}
        onOpenChange={(next) => setWithdrawing(next ? withdrawing : null)}
      />
    </div>
  );
}
