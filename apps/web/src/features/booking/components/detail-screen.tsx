"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CreditCard,
  FileText,
  Landmark,
  LifeBuoy,
  Mail,
  MessageCircle,
  Phone,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { type ReactNode, useEffect, useState } from "react";

import BoatCard from "@/components/shared/data-display/boat-card";
import EmptyState from "@/components/shared/feedback/empty-state";
import Loader from "@/components/shared/feedback/loader";
import SplitPanels from "@/components/shared/layout/split-panels";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { useMoney } from "@/hooks/use-money";
import { authClient } from "@/lib/auth-client";
import { boatCardIdentity, bookingMarina } from "@/lib/boat-card-fields";

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
 * Laid out like the booking flow it came from — the boat recap and what happened on the
 * left, the money in the sidebar — because a customer returning weeks later is looking at
 * the same booking and should not have to re-learn where things are. What it drops is the
 * wizard: nothing here is an input, and the sidebar reads the frozen booking rather than a
 * live quote, so prices cannot move under someone who has already paid.
 *
 * Same access rule as the invoice and balance pages: session or the guest token, because a
 * guest checkout has no password yet.
 */
export default function BookingDetailScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations("Booking.detail");
  const tCard = useTranslations("Common.boatCard");

  const [access, setAccess] = useState<{ token: string | undefined } | null>(null);
  useEffect(() => setAccess({ token: guestAccessFor(bookingId) }), [bookingId]);

  const { data: session, isPending: sessionPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const bookingPath = `/bookings/${bookingId}`;

  const { data: booking, isLoading } = useQuery({
    ...bookingDetailQueryOptions(bookingId, access?.token),
    enabled: access !== null,
    /* Failing here is the signed-out case, which the empty state below already explains. */
    meta: { silent: true },
  });

  if (isLoading || access === null || sessionPending) {
    return (
      <div className="flex min-h-full items-center justify-center p-8">
        <Loader />
      </div>
    );
  }

  if (!booking) {
    /*
     * Nothing came back, and for a signed-out visitor that is far more likely to be the missing
     * credential than a missing booking: the guest token lives in one browser's localStorage, so
     * the same link opened on a phone, or after clearing site data, lands here. Sign-in is the
     * way back into it, and it returns to this page.
     */
    return (
      <div className="flex min-h-full items-center justify-center p-4 md:p-8">
        <EmptyState
          title={signedIn ? t("notFound") : t("signInTitle")}
          description={signedIn ? undefined : t("signInBody")}
          action={
            signedIn ? (
              <Button variant="brand" nativeButton={false} render={<Link href="/yachts" />}>
                {t("browse")}
              </Button>
            ) : (
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <Button
                  variant="brand"
                  nativeButton={false}
                  render={<Link href={{ pathname: "/login", query: { redirect: bookingPath } }} />}
                >
                  {t("signIn")}
                </Button>
                <Button variant="neutral" nativeButton={false} render={<Link href="/yachts" />}>
                  {t("browse")}
                </Button>
              </div>
            )
          }
        />
      </div>
    );
  }

  /*
   * Built from the booking's own snapshot, not the catalogue: the card must keep rendering
   * after the listing is renamed, re-photographed or withdrawn by the provider.
   */
  const boat = {
    ...boatCardIdentity(tCard, booking.listing),
    imageAlt: tCard("imageAlt", { name: booking.listing.title, marina: booking.base.name }),
    marina: bookingMarina(booking.listing.id, booking.base),
    priceLabel: "",
    price: "",
    perPerson: "",
    prepayment: "",
  };

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs
        items={[]}
        backLabel="Booking.detail.backToBookings"
        backHref="/profile/bookings"
      />

      <div className="w-full px-4 py-6 md:px-13.5">
        <SplitPanels
          labels={{ main: t("panels.main"), aside: t("panels.aside") }}
          main={
            <>
              <BoatCard
                {...boat}
                summary
                priority
                summaryAction={
                  <Button
                    variant="neutral"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/yachts/${booking.listing.id}`} />}
                  >
                    {t("viewYacht")}
                    <ArrowUpRight />
                  </Button>
                }
              />
              <Charter booking={booking} bookingId={bookingId} />
              <Payments booking={booking} />
            </>
          }
          aside={
            <div className="flex min-h-0 w-full flex-col gap-4 overflow-y-auto">
              <PriceAside booking={booking} />
              <SupportCard booking={booking} />
            </div>
          }
        />
      </div>
    </div>
  );
}

function Charter({ booking, bookingId }: { booking: BookingDetail; bookingId: string }) {
  const t = useTranslations("Booking.detail");
  const money = useMoney();
  const format = useFormatter();

  const day = (date: string) => format.dateTime(new Date(date), "dayShort");
  const outstanding = booking.outstanding.amountMinor;
  const showPay = booking.status === "CONFIRMED" && outstanding > 0;
  /* The invoice document only exists for a booking that asked to pay by transfer. */
  const hasTransfer = booking.payments.some((row) => row.method === "transfer");

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl leading-[1.3] font-bold text-foreground">{t("charterTitle")}</h2>
        <StatusChip status={booking.status} label={t(`status.${booking.status}`)} />
      </div>

      {/* Two columns from `sm` up: a full-width panel with one column of key/value rows leaves
          the right half of the card empty. */}
      <dl className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
        <Fact label={t("dates")} value={`${day(booking.checkIn)} → ${day(booking.checkOut)}`} />
        <Fact label={t("guestsLabel")} value={String(booking.guests)} />
        {booking.crewType ? (
          <Fact label={t("crew")} value={booking.crewType} className="capitalize" />
        ) : null}
        <Fact label={t("marina")} value={`${booking.base.name}, ${booking.base.countryName}`} />
        <Fact label={t("referenceLabel")} value={booking.reference} className="font-mono" />
      </dl>

      {showPay || hasTransfer ? (
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap">
          {showPay ? (
            <Button
              variant="brand"
              className="h-13 sm:min-w-56"
              nativeButton={false}
              render={<Link href={`/bookings/${bookingId}/pay`} />}
            >
              {t("payBalance", { amount: money(outstanding) })}
            </Button>
          ) : null}

          {hasTransfer ? (
            <Button
              variant="neutral"
              className="h-13"
              nativeButton={false}
              render={<Link href={`/bookings/${bookingId}/invoice`} />}
            >
              <FileText />
              {t("viewInvoice")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function Payments({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("Booking.detail");
  const money = useMoney();

  return (
    <Panel>
      <h2 className="text-xl leading-[1.3] font-bold text-foreground">{t("paymentsTitle")}</h2>

      {booking.payments.length ? (
        <dl className="flex w-full flex-col">
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
        </dl>
      ) : (
        <p className="text-base text-natural-600">{t("noPayments")}</p>
      )}
    </Panel>
  );
}

/**
 * The money, in the slot the wizard's sidebar occupied. Shaded to match it, and reading the
 * booking's frozen lines rather than a live quote.
 */
function PriceAside({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("Booking.detail");
  const money = useMoney();
  const outstanding = booking.outstanding.amountMinor;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-xl leading-[1.3] font-bold text-foreground">{t("priceTitle")}</h2>

      <dl className="flex w-full flex-col rounded-xl bg-natural-50 p-4">
        {booking.priceLines.map((line, index) => (
          <Row
            key={`${line.code}-${index}`}
            label={line.label}
            value={money(line.amount.amountMinor)}
          />
        ))}
        <Row label={t("total")} value={money(booking.total.amountMinor)} emphasis />
      </dl>

      <dl className="flex w-full flex-col">
        <Row label={t("paid")} value={money(booking.paidTotal.amountMinor)} />
        <Row
          label={outstanding > 0 ? t("outstanding") : t("settled")}
          value={money(outstanding)}
          emphasis
        />
      </dl>
    </div>
  );
}

/**
 * Where someone goes when the page does not answer their question. The booking reference travels
 * in the subject so the first reply does not have to ask for it, and the marina's own contacts are
 * offered alongside because anything about the boat on the day is theirs to answer, not ours.
 */
function SupportCard({ booking }: { booking: BookingDetail }) {
  const t = useTranslations("Booking.detail");
  const { phone, email } = booking.base;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
          <LifeBuoy className="size-4.5" />
        </span>
        <h2 className="text-xl leading-[1.3] font-bold text-foreground">{t("supportTitle")}</h2>
      </div>

      <p className="text-sm leading-[1.4] text-natural-600">{t("supportBody")}</p>

      <Button
        variant="neutral"
        className="w-full"
        nativeButton={false}
        render={<Link href={{ pathname: "/support", query: { booking: booking.id } }} />}
      >
        <MessageCircle />
        {t("contactSupport")}
      </Button>

      {phone || email ? (
        <div className="flex flex-col gap-2 border-t border-dashed border-border pt-3">
          <span className="text-sm font-bold text-foreground">{t("marinaContact")}</span>
          {phone ? <ContactLink href={`tel:${phone}`} icon={<Phone />} label={phone} /> : null}
          {email ? <ContactLink href={`mailto:${email}`} icon={<Mail />} label={email} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ContactLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
  return (
    <a
      href={href}
      className="flex items-center gap-2 text-sm text-natural-600 transition-colors hover:text-brand [&_svg]:size-4 [&_svg]:shrink-0"
    >
      {icon}
      <span className="truncate">{label}</span>
    </a>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-5 md:p-6">
      {children}
    </section>
  );
}

/** A charter fact, stacked rather than spread — it sits in a grid cell, not across the panel. */
function Fact({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-natural-50 px-4 py-3">
      <dt className="text-sm leading-[1.4] text-natural-500">{label}</dt>
      <dd className={cn("text-base leading-[1.4] font-bold text-foreground", className)}>
        {value}
      </dd>
    </div>
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
    <div className="flex w-full items-start justify-between gap-4 border-b border-dashed border-border py-3 last:border-b-0">
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
