"use client";

import { Elements, PaymentElement } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { parseAsBoolean, useQueryStates } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";

import EmptyState from "@/components/shared/feedback/empty-state";
import Loader from "@/components/shared/feedback/loader";
import { useMoney } from "@/hooks/use-money";

import { bookingDetailQueryOptions, payBalanceMutationOptions } from "../api/queries";
import { usePayBooking } from "../hooks/use-pay-booking";
import { guestAccessFor } from "../lib/guest-access";
import {
  ELEMENTS_APPEARANCE,
  ELEMENTS_FONTS,
  elementsLocale,
  PAYMENT_ELEMENT_LAYOUT,
  stripeLoader,
} from "../lib/stripe";
import ExpressCheckout from "./steps/payment/express-checkout";
import { PaymentTargetProvider } from "./payment-target";

const POLL_INTERVAL_MS = 2000;
/* Same reasoning as the confirmation screen: past a minute, polling harder fixes nothing. */
const POLL_LIMIT_MS = 60_000;

const settledParsers = { settled: parseAsBoolean.withDefault(false) };

/**
 * Settling what is left on a confirmed booking.
 *
 * Deliberately outside the account area and with no session gate of its own, exactly like
 * the invoice page: someone who checked out as a guest has no password yet and still owes
 * the balance. The read authorises them by the booking token their browser kept.
 */
export default function BalanceScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Booking.balance");
  const money = useMoney();
  const format = useFormatter();
  const [{ settled }] = useQueryStates(settledParsers);

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
   */
  const pollingSince = useRef(Date.now());
  const { data: booking, isLoading } = useQuery({
    ...bookingDetailQueryOptions(bookingId, access?.token),
    enabled: access !== null,
    refetchInterval: (query) => {
      if (!settled || !query.state.data) return false;
      if (query.state.data.outstanding.amountMinor <= 0) return false;
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

  const outstanding = booking.outstanding.amountMinor;
  const day = (date: string) => format.dateTime(new Date(date), "dayShort");

  /* Only a confirmed charter has a balance; before that the deposit is what is owed. */
  if (booking.status !== "CONFIRMED") {
    return (
      <Centered>
        <EmptyState title={t("notPayable.title")} description={t("notPayable.body")} />
      </Centered>
    );
  }

  if (outstanding <= 0) {
    return (
      <Centered>
        <EmptyState
          illustration={null}
          title={t("paid.title")}
          description={t("paid.body", { reference: booking.reference })}
          action={
            <Button
              variant="neutral"
              nativeButton={false}
              render={<Link href="/profile/bookings" />}
            >
              {t("viewBookings")}
            </Button>
          }
        />
      </Centered>
    );
  }

  /* Paid, but our side has not caught up yet — see the polling note above. */
  if (settled) {
    return (
      <Centered>
        <EmptyState
          illustration={<Loader />}
          title={t("settling.title")}
          description={t("settling.body")}
        />
      </Centered>
    );
  }

  return (
    <Centered>
      <article className="flex w-full max-w-201.5 flex-col gap-6 rounded-2xl border border-border bg-card p-5 md:p-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-[28px] leading-[1.1] font-medium text-foreground">{t("title")}</h1>
          <p className="text-base leading-[1.4] text-natural-600">
            {booking.listing.title} · {day(booking.checkIn)} → {day(booking.checkOut)}
          </p>
          <p className="text-sm leading-[1.3] text-natural-500">
            {t("reference", { reference: booking.reference })}
          </p>
        </header>

        <dl className="flex flex-col">
          <Row label={t("summary.total")} value={money(booking.total.amountMinor)} />
          <Row label={t("summary.paid")} value={money(booking.paidTotal.amountMinor)} />
          <Row label={t("summary.due")} value={money(outstanding)} emphasis />
        </dl>

        <BalancePayment
          bookingId={bookingId}
          amountMinor={outstanding}
          currency={booking.total.currency}
        />
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
  currency,
}: {
  bookingId: string;
  amountMinor: number;
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
    }),
    [amountMinor, currency, locale],
  );

  const target = useMemo(
    () => ({
      bookingId,
      startIntent: () =>
        payBalance.mutateAsync({ bookingId, accessToken: guestAccessFor(bookingId) }),
      /* Back to this page, which then polls until our record catches up. */
      landing: `/bookings/${bookingId}/pay?settled=true`,
    }),
    [bookingId, payBalance],
  );

  if (!stripe) {
    return <p className="text-base text-natural-600">{t("unavailable")}</p>;
  }

  return (
    <Elements stripe={stripe} options={options}>
      <PaymentTargetProvider value={target}>
        <div className="flex flex-col gap-4">
          <ExpressCheckout />
          <PaymentElement options={{ layout: PAYMENT_ELEMENT_LAYOUT }} />
          <PayButton label={t("pay", { amount: money(amountMinor) })} />
        </div>
      </PaymentTargetProvider>
    </Elements>
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
      disabled={!ready || paying}
      onClick={() => void submit()}
    >
      {label}
    </Button>
  );
}
