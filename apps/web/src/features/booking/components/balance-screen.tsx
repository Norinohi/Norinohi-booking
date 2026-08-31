"use client";

import { Elements, PaymentElement } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { parseAsInteger, useQueryStates } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";

import EmptyState from "@/components/shared/feedback/empty-state";
import Loader from "@/components/shared/feedback/loader";
import { useMoney } from "@/hooks/use-money";

import { Form } from "@yacht-charter/ui/components/form/form";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import { useRouter } from "@/i18n/navigation";

import {
  bookingDetailQueryOptions,
  payBalanceMutationOptions,
  requestInvoiceMutationOptions,
} from "../api/queries";
import {
  INVOICE_DEFAULTS,
  type InvoiceFormValues,
  invoiceValuesSchema,
  useInvoiceRefinement,
} from "../lib/invoice-form";
import RequestInvoice from "./steps/payment/request-invoice";
import { usePayBooking } from "../hooks/use-pay-booking";
import { guestAccessFor } from "../lib/guest-access";
import {
  ELEMENTS_APPEARANCE,
  ELEMENTS_FONTS,
  elementsLocale,
  PAYMENT_ELEMENT_OPTIONS,
  PAYMENT_METHOD_ORDER,
  stripeLoader,
} from "../lib/stripe";
import BalancePaid from "./balance-paid";
import ExpressCheckout from "./steps/payment/express-checkout";
import { PaymentTargetProvider } from "./payment-target";

const POLL_INTERVAL_MS = 2000;
/* Same reasoning as the confirmation screen: past a minute, polling harder fixes nothing. */
const POLL_LIMIT_MS = 60_000;

/*
 * What the booking had already been paid when Pay was pressed, carried through the Stripe
 * redirect. A boolean would only say "something was paid"; the figure says which read is
 * still stale, and that is the whole question this page asks on the way back. See the poll
 * below for why "outstanding is zero" cannot answer it.
 */
const settledParsers = { paidBefore: parseAsInteger };

/**
 * Paying whatever a booking still owes.
 *
 * Two arrivals, one screen: the second installment on a confirmed charter, and the first
 * payment on one that was booked and never paid for. The server decides which through
 * `payableNow`, so this page never has to work out what it is looking at.
 *
 * Deliberately outside the account area and with no session gate of its own, exactly like
 * the invoice page: someone who checked out as a guest has no password yet and still owes
 * this money. The read authorises them by the booking token their browser kept.
 */
export default function BalanceScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Booking.balance");
  const tPayment = useTranslations("Booking.payment");
  const money = useMoney();
  const format = useFormatter();
  const [{ paidBefore }] = useQueryStates(settledParsers);
  const settling = paidBefore !== null;

  /*
   * Resolved on the client only — localStorage does not exist during prerender — and the
   * read has to land before the query runs, or a guest's first request goes out unauthorised.
   */
  const [access, setAccess] = useState<{ token: string | undefined } | null>(null);
  useEffect(() => setAccess({ token: guestAccessFor(bookingId) }), [bookingId]);

  /*
   * After paying, the money is in but our record only catches up when the webhook lands, so
   * the page polls rather than announcing an amount that is about to change. Only after a
   * payment: an unpaid balance is a resting state and would poll forever.
   *
   * The signal is the paid total rising past what it was, not the outstanding reaching zero.
   * A deposit that lands leaves a balance behind, so zero never arrives and the page would
   * poll until the limit cut it off, telling the customer we were still waiting on money we
   * already had.
   */
  const pollingSince = useRef(Date.now());
  const { data: booking, isLoading } = useQuery({
    ...bookingDetailQueryOptions(bookingId, access?.token),
    enabled: access !== null,
    refetchInterval: (query) => {
      const current = query.state.data;
      if (paidBefore === null || !current) return false;
      if (current.paidTotal.amountMinor > paidBefore) return false;
      return Date.now() - pollingSince.current > POLL_LIMIT_MS ? false : POLL_INTERVAL_MS;
    },
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
      <Centered>
        <EmptyState
          title={t("notFound")}
          action={
            <Button variant="brand" nativeButton={false} render={<Link href="/yachts" />}>
              {t("browse")}
            </Button>
          }
        />
      </Centered>
    );
  }

  const payable = booking.payableNow.amountMinor;
  const day = (date: string) => format.dateTime(new Date(date), "dayShort");

  if (booking.outstanding.amountMinor <= 0) {
    return <BalancePaid booking={booking} bookingId={bookingId} isGuest={Boolean(access.token)} />;
  }

  /*
   * Just came back from Stripe. Either our record has not caught up yet, or it has and the
   * payment landed — and a charter that still owes a later installment must not be dropped
   * straight back onto a Pay form, which reads as though the money never arrived.
   */
  if (settling) {
    const landed = booking.paidTotal.amountMinor > paidBefore;

    return (
      <Centered>
        <EmptyState
          illustration={landed ? undefined : <Loader />}
          title={landed ? t("received.title") : t("settling.title")}
          description={
            landed
              ? t("received.body", {
                  outstanding: money(booking.outstanding.amountMinor, booking.outstanding.currency),
                })
              : t("settling.body")
          }
          action={
            landed ? (
              <Button
                variant="brand"
                nativeButton={false}
                render={<Link href={`/bookings/${bookingId}`} />}
              >
                {t("received.viewBooking")}
              </Button>
            ) : undefined
          }
        />
      </Centered>
    );
  }

  /*
   * Money is owed but none of it can be taken here: the quote or the provider hold behind an
   * unpaid booking has run out, or the charter is cancelled. Offering a Pay button would open
   * a charge the server refuses, so the honest answer is the price has to be found again.
   */
  if (payable <= 0) {
    return (
      <Centered>
        <EmptyState
          title={t("notPayable.title")}
          description={t("notPayable.body")}
          action={
            <Button
              variant="brand"
              nativeButton={false}
              render={<Link href={`/yachts/${booking.listing.id}`} />}
            >
              {t("notPayable.action")}
            </Button>
          }
        />
      </Centered>
    );
  }

  return (
    <Centered>
      <article className="flex w-full max-w-201.5 flex-col gap-6 rounded-2xl border border-border bg-card p-5 md:p-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-[1.1] font-medium text-foreground">
            {booking.status === "CONFIRMED" ? t("title") : t("titleUnpaid")}
          </h1>
          <p className="text-base leading-[1.4] text-natural-600">
            {booking.listing.title} · {day(booking.checkIn)} → {day(booking.checkOut)}
          </p>
          <p className="text-sm leading-[1.3] text-natural-500">
            {t("reference", { reference: booking.reference })}
          </p>
        </header>

        {/*
          The marina's share is listed even though nothing here can charge it. Without it the
          three rows do not reconcile — total minus paid does not reach due — and the reader is
          left to guess whether they are being undercharged or the page is wrong. It is the same
          figure `dueAtCheckIn` exists to make explicable on the booking record.
        */}
        <dl className="flex flex-col">
          <Row
            label={t("summary.total")}
            value={money(booking.total.amountMinor, booking.total.currency)}
          />
          <Row
            label={t("summary.paid")}
            value={money(booking.paidTotal.amountMinor, booking.paidTotal.currency)}
          />
          {booking.dueAtCheckIn.amountMinor > 0 ? (
            <Row
              label={t("summary.atCheckIn")}
              value={money(booking.dueAtCheckIn.amountMinor, booking.dueAtCheckIn.currency)}
            />
          ) : null}
          <Row label={t("summary.due")} value={money(payable, booking.total.currency)} emphasis />
        </dl>

        {/*
          The same two ways of settling the wizard offers, for the same reason: a customer who
          paid the deposit by transfer has no card to reach for now either. Nothing about a
          second instalment makes it card-only.
        */}
        <Tabs defaultValue="card">
          <TabsList className="max-md:flex-col max-md:items-stretch">
            <TabsTab value="card" className="flex-1 max-md:flex-none">
              {tPayment("tabs.card")}
            </TabsTab>
            <TabsTab value="invoice" className="flex-1 max-md:flex-none">
              {tPayment("tabs.invoice")}
            </TabsTab>
          </TabsList>

          <TabsPanel value="card">
            <BalancePayment
              bookingId={bookingId}
              amountMinor={payable}
              paidMinor={booking.paidTotal.amountMinor}
              currency={booking.total.currency}
            />
          </TabsPanel>
          <TabsPanel value="invoice">
            <BalanceInvoice
              bookingId={bookingId}
              amountMinor={payable}
              currency={booking.total.currency}
            />
          </TabsPanel>
        </Tabs>
      </article>
    </Centered>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex min-h-full justify-center px-4 pt-6 pb-8 md:px-6 md:py-16">
      {children}
    </section>
  );
}

function Row({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-dashed border-border py-3 last:border-b-0">
      <dt className="text-base leading-[1.4] font-bold text-foreground">{label}</dt>
      <dd
        className={
          emphasis
            ? "text-xl leading-[1.3] font-bold text-foreground"
            : "text-base leading-[1.4] text-natural-600"
        }
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * The payment surface, mounted only once there is a figure to charge — Elements rejects a
 * zero amount, and `mode: "payment"` means nothing is opened server-side until Pay.
 */
function BalancePayment({
  bookingId,
  amountMinor,
  paidMinor,
  currency,
}: {
  bookingId: string;
  amountMinor: number;
  /** What has been paid so far, handed to the landing URL so the poll knows what to outgrow. */
  paidMinor: number;
  currency: string;
}) {
  const t = useTranslations("Booking.balance");
  const locale = useLocale();
  const money = useMoney();
  const stripe = stripeLoader();
  const payBalance = useMutation(payBalanceMutationOptions());

  const options = useMemo<StripeElementsOptions>(
    () => ({
      mode: "payment",
      amount: amountMinor,
      currency: currency.toLowerCase(),
      locale: elementsLocale(locale),
      appearance: ELEMENTS_APPEARANCE,
      fonts: ELEMENTS_FONTS,
      paymentMethodOrder: PAYMENT_METHOD_ORDER,
    }),
    [amountMinor, currency, locale],
  );

  const target = useMemo(
    () => ({
      bookingId,
      startIntent: () =>
        payBalance.mutateAsync({ bookingId, accessToken: guestAccessFor(bookingId) }),
      /* Back to this page, which then polls until our record catches up. */
      landing: `/bookings/${bookingId}/pay?paidBefore=${paidMinor}`,
    }),
    [bookingId, paidMinor, payBalance],
  );

  if (!stripe) {
    return <p className="text-base text-natural-600">{t("unavailable")}</p>;
  }

  return (
    <Elements stripe={stripe} options={options}>
      <PaymentTargetProvider value={target}>
        <div className="flex flex-col gap-4">
          <ExpressCheckout />
          <PaymentElement options={PAYMENT_ELEMENT_OPTIONS} />
          <PayButton label={t("pay", { amount: money(amountMinor, currency) })} />
        </div>
      </PaymentTargetProvider>
    </Elements>
  );
}

/**
 * Requesting an invoice for what is outstanding. The same billing block the wizard collects,
 * with its own form because there is no wizard here to hold one — the server raises the
 * document against `payableNow`, so this asks for exactly the figure beside the button.
 */
function BalanceInvoice({
  bookingId,
  amountMinor,
  currency,
}: {
  bookingId: string;
  amountMinor: number;
  currency: string;
}) {
  const t = useTranslations("Booking.payment");
  const money = useMoney();
  const router = useRouter();
  const requestInvoice = useMutation(requestInvoiceMutationOptions());
  const refineInvoice = useInvoiceRefinement();

  /* Memoised: a new schema identity on every render re-registers the resolver. */
  const schema = useMemo(
    () =>
      z
        .object({ payment: z.object({ invoice: invoiceValuesSchema }) })
        .superRefine((value, ctx) =>
          refineInvoice(value.payment.invoice, ctx, ["payment", "invoice"]),
        ),
    [refineInvoice],
  );

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { payment: { invoice: INVOICE_DEFAULTS } },
    mode: "onTouched",
  });

  async function submit(values: InvoiceFormValues) {
    const invoice = values.payment.invoice;
    try {
      await requestInvoice.mutateAsync({
        bookingId,
        accessToken: guestAccessFor(bookingId),
        billingEmail: invoice.email,
        billingName: invoice.name,
        addressLine1: invoice.addressLine1,
        addressLine2: invoice.addressLine2 || undefined,
        city: invoice.city || undefined,
        postalCode: invoice.postalCode || undefined,
        countryCode: invoice.countryCode,
        companyName: invoice.company || undefined,
        vatNumber: invoice.vat || undefined,
        registrationNumber: invoice.registration || undefined,
      });
      /* Where the bank details are, and the document itself. */
      router.push(`/bookings/${bookingId}/invoice`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("submitFailed"));
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex flex-col gap-4">
        <RequestInvoice />
        <Button
          type="submit"
          variant="brand"
          className="h-13 w-full"
          loading={form.formState.isSubmitting}
        >
          {t("invoice.cta", { amount: money(amountMinor, currency) })}
        </Button>
      </form>
    </Form>
  );
}

function PayButton({ label }: { label: string }) {
  const { pay, ready } = usePayBooking();
  const [paying, setPaying] = useState(false);

  async function submit() {
    setPaying(true);
    try {
      await pay();
    } finally {
      setPaying(false);
    }
  }

  return (
    <Button
      variant="brand"
      className="h-13 w-full"
      loading={paying}
      disabled={!ready}
      onClick={() => void submit()}
    >
      {label}
    </Button>
  );
}
