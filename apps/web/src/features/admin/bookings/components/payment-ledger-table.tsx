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
import { Banknote, CreditCard, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Link } from "@/i18n/navigation";

import { useInstant } from "../../shared/hooks/use-instant";
import { useAmount } from "../hooks/use-amount";
import { usePaymentLedger } from "../hooks/use-payments";
import type { PaymentAdminRow, PaymentKind, PaymentMethod, PaymentStatus } from "../types";

/*
 * PaymentLedgerTable — every payment taken, whatever it was for and however it arrived.
 *
 * The two tabs beside this one are queues: rows that need a person, and that leave when the
 * work is done. This one is the opposite and is read-only on purpose — a deposit charged to a
 * card in March is not work, it is the answer to "did this customer pay, and when". Until it
 * existed that answer was only reachable by opening the booking, one at a time.
 *
 * One row per payment, not per booking, because a charter is regularly a deposit on a card and
 * a balance by transfer months later, and those are the two facts being looked for.
 */

/* Sentinel for "All …": a real value, since a falsy selection makes Select show its placeholder. */
const ALL = "all";

const STATUSES: readonly PaymentStatus[] = [
  "requires_payment",
  "processing",
  "authorized",
  "succeeded",
  "failed",
  "refunded",
];

const KINDS: readonly PaymentKind[] = [
  "deposit",
  "balance",
  "full",
  "checkin_extras",
  "security_deposit",
];

const METHODS: readonly PaymentMethod[] = ["card", "transfer"];

const STATUS_VARIANTS = {
  requires_payment: "neutral",
  processing: "warning",
  /* Warning, not success: the card is held and the money is still the customer's. */
  authorized: "warning",
  succeeded: "success",
  failed: "error",
  refunded: "neutral",
} as const satisfies Record<PaymentStatus, string>;

const COLUMN_COUNT = 7;
const SKELETON_ROWS = 5;
const SKELETON_WIDTHS = ["w-24", "w-32", "w-28", "w-20", "w-20", "w-24", "w-20"];

export default function PaymentLedgerTable() {
  const t = useTranslations("Admin.Payments.ledger");
  const instant = useInstant();
  const amount = useAmount();
  const [status, setStatus] = useState<string>(ALL);
  const [kind, setKind] = useState<string>(ALL);
  const [method, setMethod] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const selectedStatus = STATUSES.find((option) => option === status);
  const selectedKind = KINDS.find((option) => option === kind);

  const { data, isPending, isError } = usePaymentLedger({
    status: selectedStatus ? [selectedStatus] : undefined,
    kind: selectedKind ? [selectedKind] : undefined,
    method: METHODS.find((option) => option === method),
    query: query.trim() || undefined,
    page,
  });

  const at = (value: string) => instant(value, { dateStyle: "short", timeStyle: "short" });
  const collected = data?.totals.filter((total) => total.collectedMinor > 0) ?? [];

  /* Every filter resets the page: page 4 of a narrower result is usually empty. */
  const filter = (apply: (value: string) => void) => (next: string) => {
    apply(next);
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
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center">
        <TextField
          containerClassName="min-w-0 md:max-w-80"
          fieldClassName="h-12"
          value={query}
          startIcon={<Search />}
          placeholder={t("filters.search")}
          onChange={(event) => filter(setQuery)(event.target.value)}
        />
        <Select
          className="h-12 min-w-0 md:w-48"
          ariaLabel={t("filters.status")}
          value={status}
          onValueChange={filter(setStatus)}
          options={[
            { value: ALL, label: t("filters.allStatuses") },
            ...STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
          ]}
        />
        <Select
          className="h-12 min-w-0 md:w-48"
          ariaLabel={t("filters.kind")}
          value={kind}
          onValueChange={filter(setKind)}
          options={[
            { value: ALL, label: t("filters.allKinds") },
            ...KINDS.map((value) => ({ value, label: t(`kind.${value}`) })),
          ]}
        />
        <Select
          className="h-12 min-w-0 md:w-44"
          ariaLabel={t("filters.method")}
          value={method}
          onValueChange={filter(setMethod)}
          options={[
            { value: ALL, label: t("filters.allMethods") },
            ...METHODS.map((value) => ({ value, label: t(`method.${value}`) })),
          ]}
        />
      </div>

      {/* The totals answer "how much came in", so they cover the whole filter rather than the
          twenty rows on screen, and each currency stands alone rather than being added up.
          A currency nothing was collected in is left out: a tile reading zero looks like a
          figure that went wrong rather than one payment that has not been paid yet. */}
      {collected.length > 0 ? (
        <div className="flex flex-wrap gap-3">
          {collected.map((total) => (
            <div
              key={total.currency}
              className="flex flex-col gap-0.5 rounded-xl border border-natural-100 px-4 py-3"
            >
              <span className="text-sm font-medium text-natural-500">
                {t("totals.collected", { count: total.count })}
              </span>
              <span className="text-lg font-bold text-foreground">
                {amount({ amountMinor: total.collectedMinor, currency: total.currency })}
              </span>
              {total.refundedMinor > 0 ? (
                <span className="text-sm font-medium text-natural-500">
                  {t("totals.refunded", {
                    amount: amount({
                      amountMinor: total.refundedMinor,
                      currency: total.currency,
                    }),
                  })}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <Table className="min-w-200 [&_td]:px-3 [&_td]:py-3 [&_th]:h-12.5 [&_th]:px-3 [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead className="w-36">{t("table.date")}</TableHead>
            <TableHead className="w-44">{t("table.booking")}</TableHead>
            <TableHead>{t("table.customer")}</TableHead>
            <TableHead className="w-32">{t("table.kind")}</TableHead>
            <TableHead className="w-28">{t("table.method")}</TableHead>
            <TableHead className="w-32">{t("table.amount")}</TableHead>
            <TableHead className="w-28">{t("table.status")}</TableHead>
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
                : data.items.map((row) => (
                    <PaymentRow key={row.id} row={row} at={at} amount={amount} />
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

interface PaymentRowProps {
  row: PaymentAdminRow;
  at: (value: string) => string;
  amount: (money: { amountMinor: number; currency: string }) => string;
}

function PaymentRow({ row, at, amount }: PaymentRowProps) {
  const t = useTranslations("Admin.Payments.ledger");

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap">
        {/* The date that matters is when the money landed; a payment that never landed still
            has to be datable, so the attempt's own date is the fallback rather than a dash. */}
        <span className="block">{at(row.paidAt ?? row.createdAt)}</span>
        {row.paidAt ? null : (
          <span className="block text-sm text-natural-500">{t("startedAt")}</span>
        )}
      </TableCell>
      <TableCell>
        <Link
          href={`/admin/staff/bookings/${row.bookingId}`}
          className="font-medium text-brand hover:underline"
        >
          {row.reference}
        </Link>
        <span className="block max-w-44 truncate text-sm text-natural-500" title={row.listingTitle}>
          {row.listingTitle}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex flex-col">
          <span className="max-w-52 truncate font-medium text-foreground">
            {row.customerName ?? "-"}
          </span>
          <a
            href={`mailto:${row.customerEmail}`}
            title={row.customerEmail}
            className="max-w-52 truncate text-sm text-natural-500 transition-colors hover:text-brand"
          >
            {row.customerEmail}
          </a>
        </div>
      </TableCell>
      <TableCell className="text-sm font-medium text-foreground">{t(`kind.${row.kind}`)}</TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground [&_svg]:size-4 [&_svg]:text-natural-500">
          {row.method === "card" ? <CreditCard /> : <Banknote />}
          {t(`method.${row.method}`)}
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap font-medium text-foreground">
        {amount(row.amount)}
        {/* A part-refunded payment keeps its succeeded status, so the returned share is the
            only thing on the row that says the customer did not keep the charter. */}
        {row.refunded.amountMinor > 0 ? (
          <span className="block text-sm font-medium text-natural-500">
            {t("returned", { amount: amount(row.refunded) })}
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          <Chip variant={STATUS_VARIANTS[row.status]}>{t(`status.${row.status}`)}</Chip>
          {/* Contested money is neither paid nor returned, and nothing in `status` says so. */}
          {row.disputedAt ? <Chip variant="error">{t("disputed")}</Chip> : null}
          {row.status === "failed" && row.failureReason ? (
            <span className="max-w-28 truncate text-sm text-natural-500" title={row.failureReason}>
              {row.failureReason}
            </span>
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}
