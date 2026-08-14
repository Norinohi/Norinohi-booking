"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, FileText, Landmark } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { type ReactNode, useEffect, useState } from "react";

import EmptyState from "@/components/shared/feedback/empty-state";
import Loader from "@/components/shared/feedback/loader";
import { useMoney } from "@/hooks/use-money";

import { type BookingDetail, bookingDetailQueryOptions } from "../api/queries";
import { guestAccessFor } from "../lib/guest-access";

/* Which statuses read as "this charter is happening" versus a problem worth colouring. */
const SETTLED_STATUSES = new Set(["CONFIRMED"]);
const FAILED_STATUSES = new Set([
  "CANCELLED",
  "REFUNDED",
  "REFUND_PENDING",
  "PROVIDER_REJECTED",
  "PAYMENT_FAILED",
]);

/**
 * Everything about one booking, after the fact.
 *
 * The confirmation screen celebrates a booking that has just been made and is reached once;
 * this is the page a customer comes back to weeks later to check what they owe, what they
 * paid and how. Same access rule as the invoice and balance pages: session or the guest
 * token, because a guest checkout has no password yet.
 */
export default function BookingDetailScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Booking.detail");
  const money = useMoney();
  const format = useFormatter();

  const [access, setAccess] = useState<{ token: string | undefined } | null>(null);
  useEffect(() => setAccess({ token: guestAccessFor(bookingId) }), [bookingId]);

  const { data: booking, isLoading } = useQuery({
    ...bookingDetailQueryOptions(bookingId, access?.token),
    enabled: access !== null,
  });

  if (isLoading || access === null) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <Loader />
      </div>
    );
  }

  if (!booking) {
    return (
      <Shell>
        <EmptyState
          title={t("notFound")}
          action={
            <Button variant="brand" nativeButton={false} render={<Link href="/yachts" />}>
              {t("browse")}
            </Button>
          }
        />
      </Shell>
    );
  }

  const day = (date: string) => format.dateTime(new Date(date), "dayShort");
  const outstanding = booking.outstanding.amountMinor;
  /* The invoice document only exists for a booking that asked to pay by transfer. */
  const hasTransfer = booking.payments.some((row) => row.method === "transfer");

  return (
    <Shell>
      <article className="flex w-full max-w-201.5 flex-col gap-6">
        <header className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 md:p-8">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[28px] leading-[1.1] font-medium text-foreground">
              {booking.listing.title}
            </h1>
            <StatusChip status={booking.status} label={t(`status.${booking.status}`)} />
          </div>
          <p className="text-base leading-[1.4] text-natural-600">
            {day(booking.checkIn)} → {day(booking.checkOut)} ·{" "}
            {t("guests", { count: booking.guests })}
            {booking.crewType ? ` · ${booking.crewType}` : ""}
          </p>
          <p className="text-sm leading-[1.3] text-natural-500">
            {t("reference", { reference: booking.reference })} · {booking.base.name},{" "}
            {booking.base.countryName}
          </p>

          <div className="flex flex-col gap-3 pt-2 md:flex-row">
            {booking.status === "CONFIRMED" && outstanding > 0 ? (
              <Button
                variant="brand"
                nativeButton={false}
                render={<Link href={`/bookings/${bookingId}/pay`} />}
              >
                {t("payBalance", { amount: money(outstanding) })}
              </Button>
            ) : null}
            {hasTransfer ? (
              <Button
                variant="neutral"
                nativeButton={false}
                render={<Link href={`/bookings/${bookingId}/invoice`} />}
              >
                <FileText />
                {t("viewInvoice")}
              </Button>
            ) : null}
          </div>
        </header>

        <Section title={t("priceTitle")}>
          <dl className="flex flex-col">
            {booking.priceLines.map((line) => (
              <Row
                key={`${line.code}-${line.label}`}
                label={line.label}
                value={money(line.amount.amountMinor)}
              />
            ))}
            <Row label={t("total")} value={money(booking.total.amountMinor)} emphasis />
          </dl>
        </Section>

        <Section title={t("paymentsTitle")}>
          {booking.payments.length ? (
            <dl className="flex flex-col">
              {booking.payments.map((row) => (
                <Row
                  key={row.id}
                  label={t(`kind.${row.kind}`)}
                  /* Method per payment, so a transfer deposit and a card balance both show truly. */
                  note={
                    <span className="flex items-center gap-1.5 text-sm text-natural-500">
                      {row.method === "card" ? (
                        <CreditCard className="size-4" />
                      ) : (
                        <Landmark className="size-4" />
                      )}
                      {t(`method.${row.method}`)} · {t(`paymentStatus.${row.status}`)}
                      {row.disputedAt ? ` · ${t("disputed")}` : ""}
                    </span>
                  }
                  value={money(row.amount.amountMinor)}
                />
              ))}
              <Row label={t("paid")} value={money(booking.paidTotal.amountMinor)} emphasis />
              {outstanding > 0 ? (
                <Row label={t("outstanding")} value={money(outstanding)} emphasis />
              ) : null}
            </dl>
          ) : (
            <p className="text-base text-natural-600">{t("noPayments")}</p>
          )}
        </Section>
      </article>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="flex min-h-full justify-center px-4 pt-6 pb-8 md:px-6 md:py-16">
      {children}
    </section>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 md:p-8">
      <h2 className="text-xl leading-[1.3] font-bold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function StatusChip({ status, label }: { status: BookingDetail["status"]; label: string }) {
  if (SETTLED_STATUSES.has(status)) {
    return <Chip className="shrink-0 bg-positive-50 text-positive-600">{label}</Chip>;
  }
  if (FAILED_STATUSES.has(status)) {
    return <Chip className="shrink-0 bg-error-50 text-error-600">{label}</Chip>;
  }
  return <Chip className="shrink-0">{label}</Chip>;
}

function Row({
  label,
  value,
  note,
  emphasis,
}: {
  label: string;
  value: string;
  note?: ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-dashed border-border py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <dt className="text-base leading-[1.4] font-bold text-foreground">{label}</dt>
        {note ? <dd className="order-last">{note}</dd> : null}
      </div>
      <dd
        className={
          emphasis
            ? "shrink-0 text-xl leading-[1.3] font-bold text-foreground"
            : "shrink-0 text-base leading-[1.4] text-natural-600"
        }
      >
        {value}
      </dd>
    </div>
  );
}
