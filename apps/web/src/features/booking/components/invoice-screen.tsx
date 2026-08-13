"use client";

import { useQuery } from "@tanstack/react-query";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { Printer } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";

import EmptyState from "@/components/shared/feedback/empty-state";
import Loader from "@/components/shared/feedback/loader";
import { useMoney } from "@/hooks/use-money";

import { bookingInvoiceQueryOptions, type InvoiceDocument } from "../api/queries";

/*
 * The printable invoice. Everything on the page comes from `booking.invoice` — the seller block,
 * the billed party as captured at checkout, the priced lines and the transfer instructions — so
 * what the customer prints is what the server issued, down to the document number.
 *
 * There is no PDF renderer here on purpose: the browser's own "Save as PDF" produces a proper
 * file from this markup, and the same markup is what an emailed invoice will use once a sender
 * exists. Print styling is `print:` variants plus the `data-print-document` rules in globals.css,
 * which drop the app's header and footer from the sheet.
 */
export default function InvoiceScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Booking.invoice");
  const { data: invoice, isPending, isError } = useQuery(bookingInvoiceQueryOptions(bookingId));

  if (isPending) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <Loader />
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <EmptyState
          title={t(isError ? "error.title" : "missing.title")}
          description={t(isError ? "error.description" : "missing.description")}
          action={
            <Button variant="brand" nativeButton={false} render={<Link href="/profile/bookings" />}>
              {t("backToBookings")}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <section
      data-print-document
      className="flex min-h-full justify-center px-4 py-8 md:px-6 md:py-12 print:p-0"
    >
      <div className="flex w-full max-w-201.5 flex-col gap-4">
        <div className="flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between print:hidden">
          <Button variant="neutral" nativeButton={false} render={<Link href="/profile/bookings" />}>
            {t("backToBookings")}
          </Button>
          <Button variant="brand" onClick={() => window.print()}>
            <Printer />
            {t("print")}
          </Button>
        </div>

        <article className="flex flex-col gap-8 rounded-2xl border border-border bg-card p-6 md:p-10 print:rounded-none print:border-0 print:p-0">
          <InvoiceHeader invoice={invoice} />
          <Parties invoice={invoice} />
          <CharterSummary invoice={invoice} />
          <Lines invoice={invoice} />
          <Totals invoice={invoice} />
          <PaymentInstructions invoice={invoice} />

          <p className="border-t border-border pt-4 text-xs leading-relaxed text-natural-500">
            {t("footnote", { company: invoice.seller.legalName })}
          </p>
        </article>
      </div>
    </section>
  );
}

function InvoiceHeader({ invoice }: { invoice: InvoiceDocument }) {
  const t = useTranslations("Booking.invoice");
  const format = useFormatter();
  const day = (value: string) => format.dateTime(new Date(value), "day");

  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 md:flex-row md:items-start md:justify-between">
      <div className="flex flex-col gap-1">
        <span className="text-xl font-bold text-foreground">{invoice.seller.tradingName}</span>
        <span className="text-sm text-natural-600">{invoice.seller.website}</span>
      </div>

      <div className="flex flex-col gap-1 md:text-right">
        <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>
        <span className="text-base font-semibold text-foreground">{invoice.number}</span>
        <span className="text-sm text-natural-600">
          {t("issuedOn", { date: day(invoice.issuedAt) })}
        </span>
        <span className="text-sm font-semibold text-foreground">
          {t("dueOn", { date: day(invoice.dueAt) })}
        </span>
        <span className="text-sm text-natural-600">{t(`status.${invoice.status}`)}</span>
      </div>
    </header>
  );
}

function Parties({ invoice }: { invoice: InvoiceDocument }) {
  const t = useTranslations("Booking.invoice");
  const { seller, billTo } = invoice;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Party title={t("from")}>
        <strong className="font-semibold text-foreground">{seller.legalName}</strong>
        <span>{seller.addressLine1}</span>
        {seller.addressLine2 && <span>{seller.addressLine2}</span>}
        <span>{[seller.postalCode, seller.city].filter(Boolean).join(" ")}</span>
        <span>{seller.countryCode}</span>
        <span>{t("vat", { value: seller.vatNumber })}</span>
        <span>{t("registration", { value: seller.registrationNumber })}</span>
        <span>{seller.email}</span>
        <span>{seller.phone}</span>
      </Party>

      <Party title={t("billTo")}>
        <strong className="font-semibold text-foreground">
          {billTo.companyName ?? billTo.name}
        </strong>
        {billTo.companyName && <span>{billTo.name}</span>}
        {billTo.addressLine1 && <span>{billTo.addressLine1}</span>}
        {billTo.addressLine2 && <span>{billTo.addressLine2}</span>}
        {(billTo.postalCode ?? billTo.city) && (
          <span>{[billTo.postalCode, billTo.city].filter(Boolean).join(" ")}</span>
        )}
        {billTo.countryCode && <span>{billTo.countryCode}</span>}
        {billTo.vatNumber && <span>{t("vat", { value: billTo.vatNumber })}</span>}
        {billTo.registrationNumber && (
          <span>{t("registration", { value: billTo.registrationNumber })}</span>
        )}
        <span>{billTo.email}</span>
      </Party>
    </div>
  );
}

function Party({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 text-sm text-natural-600">
      <span className="pb-1 text-xs tracking-[0.08em] text-natural-500 uppercase">{title}</span>
      {children}
    </div>
  );
}

function CharterSummary({ invoice }: { invoice: InvoiceDocument }) {
  const t = useTranslations("Booking.invoice");
  const format = useFormatter();
  const day = (value: string) => format.dateTime(new Date(value), "day");
  const { booking } = invoice;

  const rows = [
    { label: t("summary.reference"), value: booking.reference },
    { label: t("summary.yacht"), value: booking.listingTitle },
    {
      label: t("summary.base"),
      // Deduplicated: NauSYS bases often carry the marina's full name as the location too,
      // which would otherwise print "Komolac, ACI Marina, Komolac, ACI Marina, Croatia".
      value: [...new Set([booking.baseName, booking.locationName, booking.countryName])]
        .filter(Boolean)
        .join(", "),
    },
    {
      label: t("summary.dates"),
      value: `${day(`${booking.checkIn}T00:00:00.000Z`)} → ${day(`${booking.checkOut}T00:00:00.000Z`)}`,
    },
    { label: t("summary.guests"), value: String(booking.guests) },
  ];

  return (
    <dl className="grid gap-x-6 gap-y-2 rounded-xl bg-brand-50 p-5 md:grid-cols-2 print:bg-transparent print:p-0">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4 text-sm">
          <dt className="text-natural-600">{row.label}</dt>
          <dd className="text-right font-semibold text-foreground">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Lines({ invoice }: { invoice: InvoiceDocument }) {
  const t = useTranslations("Booking.invoice");
  const money = useMoney();

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left">
          <th className="py-2 font-semibold text-foreground">{t("lines.description")}</th>
          <th className="py-2 font-semibold text-foreground">{t("lines.collected")}</th>
          <th className="py-2 text-right font-semibold text-foreground">{t("lines.amount")}</th>
        </tr>
      </thead>
      <tbody>
        {invoice.lines.map((line) => (
          <tr key={line.code} className="border-b border-border/60">
            <td className="py-2 text-foreground">{line.label}</td>
            <td className="py-2 text-natural-600">{t(`payWhen.${line.payWhen}`)}</td>
            <td className="py-2 text-right text-foreground">{money(line.amount.amountMinor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Totals({ invoice }: { invoice: InvoiceDocument }) {
  const t = useTranslations("Booking.invoice");
  const money = useMoney();

  return (
    <div className="flex flex-col gap-2 self-end text-sm md:w-80">
      <TotalRow label={t("totals.charterTotal")} value={money(invoice.total.amountMinor)} />
      {invoice.paidTotal.amountMinor > 0 && (
        <TotalRow label={t("totals.paid")} value={money(invoice.paidTotal.amountMinor)} />
      )}
      <TotalRow label={t("totals.dueNow")} value={money(invoice.amountDue.amountMinor)} emphasis />
      <TotalRow label={t("totals.balance")} value={money(invoice.balanceDue.amountMinor)} />
      {invoice.securityDeposit && (
        <p className="pt-1 text-xs text-natural-500">
          {t("totals.securityDeposit", {
            amount: money(invoice.securityDeposit.amountMinor),
          })}
        </p>
      )}
    </div>
  );
}

function TotalRow({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={
        emphasis
          ? "flex justify-between gap-4 border-y border-border py-2 text-base font-bold text-foreground"
          : "flex justify-between gap-4 text-natural-600"
      }
    >
      <span>{label}</span>
      <span className={emphasis ? undefined : "font-semibold text-foreground"}>{value}</span>
    </div>
  );
}

function PaymentInstructions({ invoice }: { invoice: InvoiceDocument }) {
  const t = useTranslations("Booking.invoice");
  const money = useMoney();

  const rows = [
    { label: t("payment.beneficiary"), value: invoice.seller.legalName },
    { label: t("payment.bank"), value: invoice.payment.bankName },
    { label: t("payment.iban"), value: invoice.payment.iban },
    { label: t("payment.bic"), value: invoice.payment.bic },
    { label: t("payment.reference"), value: invoice.payment.reference },
    { label: t("payment.amount"), value: money(invoice.amountDue.amountMinor) },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-5">
      <h2 className="text-base font-bold text-foreground">{t("payment.title")}</h2>
      <dl className="grid gap-x-6 gap-y-2 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between gap-4 text-sm">
            <dt className="text-natural-600">{row.label}</dt>
            <dd className="text-right font-semibold text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-natural-500">{t("payment.note")}</p>
    </div>
  );
}
