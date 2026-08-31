"use client";

import { placeLine } from "@yacht-charter/api/lib/place-line";
import { Button } from "@yacht-charter/ui/components/actions/button";
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
import { useFormatter, useTranslations } from "next-intl";
import { useState, type ComponentProps } from "react";

import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";

import { useAmount } from "../hooks/use-amount";
import { useAdminBooking, useSetBookingExcluded } from "../hooks/use-payments";
import { type BookingAdminDetail, toProviderKey } from "../types";
import AdminCancelBookingDialog from "./admin-cancel-booking-dialog";

/*
 * StaffBookingScreen — /staff/bookings/[id]: one booking as support sees it.
 *
 * A separate screen from the customer's /bookings/[id] rather than a role branch inside it,
 * because the two answer different questions. The customer's own page is their card — gallery,
 * amenities, "pay balance" — and it is scoped to them by design. This one exists to explain a
 * number: who owns the booking, what the provider holds, which installment is outstanding, and
 * how each payment arrived. Keeping them apart is what stops a widened staff read from leaking
 * into the customer view.
 *
 * The banner is deliberate. Someone else's name, email and money are on this page, and a screen
 * that looks like the customer's own is a screen staff will screenshot into a chat thread.
 */

type ChipVariant = ComponentProps<typeof Chip>["variant"];

const STATUS_VARIANTS = {
  CONFIRMED: "success",
  REFUNDED: "success",
  PAYMENT_PENDING: "warning",
  OPTION_HELD: "warning",
  CONFIRMING: "warning",
  REFUND_PENDING: "error",
  PAYMENT_FAILED: "error",
  PROVIDER_REJECTED: "error",
  CANCELLED: "neutral",
  QUOTE_EXPIRED: "neutral",
  OPTION_EXPIRED: "neutral",
} as const satisfies Record<string, ChipVariant>;

const PAYMENT_VARIANTS = {
  succeeded: "success",
  processing: "warning",
  // A hold, not a charge: the operator still has to answer before it becomes money.
  authorized: "warning",
  requires_payment: "warning",
  failed: "error",
  refunded: "neutral",
} as const satisfies Record<string, ChipVariant>;

/* Both enums carry values with no colour of their own (DRAFT, QUOTED); they read as neutral
   rather than forcing every member into a map that would have to be edited in lockstep. */
function chipVariant(map: Record<string, ChipVariant>, key: string): ChipVariant {
  return map[key] ?? "neutral";
}

/*
 * The vendor's last word, when it is one that means the boat is still theirs to give back.
 * `cancelled` and a null (a provider that was never asked) are the other side of this.
 */
const PROVIDER_HOLDS = ["confirmed", "option_held"];

/*
 * Statuses that say we let the slot go. Cancelling a CONFIRMED booking lands at REFUND_PENDING
 * rather than CANCELLED, so both belong here: the pair with a provider that still holds is
 * exactly the case where money is about to be returned on a charter we are still billed for.
 */
const RELEASED_BY_US = ["CANCELLED", "REFUND_PENDING"];

/*
 * Where cancelling is refused, so the button is not offered. CONFIRMING is out because the money
 * is already with the provider and their answer is a moment away — the state machine sends it to
 * CONFIRMED or PROVIDER_REJECTED and nowhere else. The last three are already finished.
 */
const UNCANCELLABLE = ["CONFIRMING", "CANCELLED", "REFUND_PENDING", "REFUNDED"];

/*
 * `crewType` is a provider code until the API finds a translation for it, after which it arrives
 * as a display label. Recognising the code is what tells the two apart — a label is printed as
 * it came, a code is mapped. Mirrors `crewKey` in the yachts feature, which is not on its public
 * index; the list is three entries and the contract's, not that feature's.
 */
const CREW_KEYS = ["bareboat", "skipper", "full-crew"] as const;

function crewKey(value: string): (typeof CREW_KEYS)[number] | null {
  return CREW_KEYS.find((key) => key === value) ?? null;
}

export default function StaffBookingScreen({ id }: { id: string }) {
  const t = useTranslations("Admin.StaffBooking");
  const { data, isPending, isError } = useAdminBooking(id);

  return (
    <div className="flex flex-col">
      {/* Back to the bookings list, not to whichever queue was used to get here: this screen
          is reached from four of them, and the list is the one place every booking is. */}
      <AppBreadcrumbs items={[]} backLabel="Admin.StaffBooking.back" backHref="/staff/bookings" />

      <div className="px-4 py-6 md:px-13.5">
        <div className="mx-auto flex w-full max-w-349 flex-col gap-5">
          <div className="rounded-2xl border border-warning-200 bg-warning-50 px-5 py-4">
            <p className="text-sm font-semibold text-warning-600">{t("staffOnly")}</p>
          </div>

          {isPending ? (
            <Skeleton className="h-96 rounded-2xl" />
          ) : isError || !data ? (
            <div className="rounded-2xl border border-natural-100 bg-card p-8 text-center">
              <p className="text-base font-medium text-natural-500">{t("error")}</p>
            </div>
          ) : (
            <Detail booking={data} />
          )}
        </div>
      </div>
    </div>
  );
}

/* Reads its own translator and formatters rather than taking them as props: next-intl's
   Translator is generically typed against the message tree, and threading it through a prop
   erases that — the loose signature it would need is exactly what the typed-messages setup
   exists to prevent. */
function Detail({ booking }: { booking: BookingAdminDetail }) {
  const t = useTranslations("Admin.StaffBooking");
  const tStatus = useTranslations("Admin.Bookings.status");
  const tInvoiceStatus = useTranslations("Admin.Payments.invoices.status");
  const tProviders = useTranslations("Admin.providers");
  const tCrew = useTranslations("Common.crewTypes");
  const tDetail = useTranslations("Booking.detail");
  const format = useFormatter();
  const amount = useAmount();

  /* Enum codes from the contract, each rendered through the map that already names it elsewhere.
     The provider and crew values are plain strings on the wire, so those two fall back to the raw
     code when it is one this build does not know. */
  const providerLabel = (code: string) => {
    const key = toProviderKey(code);
    return key ? tProviders(key) : code;
  };
  const crewLabel = (value: string) => {
    const key = crewKey(value);
    return key ? tCrew(key) : value;
  };

  const at = (value: string | null) =>
    value ? format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" }) : "—";
  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium" });

  /*
   * The base collects the check-in lines on the day, so they sit in the total and in nothing we
   * charge. Subtracting them is what stops this panel reporting money as owed that no queue will
   * ever chase — the same arithmetic `outstandingMinor` does server-side for the customer card.
   */
  const atCheckInMinor = booking.priceLines
    .filter((line) => line.payWhen === "at_check_in")
    .reduce((total, line) => total + line.amount.amountMinor, 0);

  const outstandingMinor = Math.max(
    booking.total.amountMinor - atCheckInMinor - booking.paid.amountMinor,
    0,
  );

  const providerStillHolds =
    RELEASED_BY_US.includes(booking.status) &&
    booking.providerStatus !== null &&
    PROVIDER_HOLDS.includes(booking.providerStatus);

  return (
    <>
      {providerStillHolds ? (
        <section className="flex flex-col gap-1 rounded-2xl border border-error-200 bg-error-50 px-5 py-4">
          <p className="text-sm font-semibold text-error-600">
            {t("providerHold.title", { provider: providerLabel(booking.provider) })}
          </p>
          <p className="text-sm text-error-600">{t("providerHold.body")}</p>
        </section>
      ) : null}

      <section className="flex flex-col gap-4 rounded-2xl border border-natural-100 bg-card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl leading-[1.3] font-bold text-foreground">{booking.reference}</h1>
          <Chip variant={chipVariant(STATUS_VARIANTS, booking.status)}>
            {tStatus(booking.status)}
          </Chip>
          {booking.isGuestAccount ? <Chip variant="outline">{t("guestAccount")}</Chip> : null}
          {booking.excludedAt ? <Chip variant="neutral">{t("excluded.chip")}</Chip> : null}
        </div>
        <StaffActions booking={booking} providerLabel={providerLabel(booking.provider)} />
        <p className="text-base text-natural-500">
          {booking.listingTitle} · {placeLine(booking.base.name, booking.base.countryName)}
        </p>

        <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Field label={t("fields.customer")}>
            <span className="block font-medium text-foreground">{booking.customerName ?? "—"}</span>
            <a
              href={`mailto:${booking.customerEmail}`}
              className="text-sm text-natural-500 transition-colors hover:text-brand"
            >
              {booking.customerEmail}
            </a>
          </Field>
          <Field label={t("fields.charter")}>
            {day(booking.checkIn)} → {day(booking.checkOut)}
            <span className="block text-sm text-natural-500">
              {t("guests", { count: booking.guests })}
              {booking.crewType ? ` · ${crewLabel(booking.crewType)}` : ""}
            </span>
          </Field>
          <Field label={t("fields.provider")}>
            {providerLabel(booking.provider)}
            <span className="block text-sm text-natural-500">
              {booking.providerReservationId ?? t("noReservationId")}
            </span>
          </Field>
          <Field label={t("fields.total")}>{amount(booking.total)}</Field>
          <Field label={t("fields.collected")}>
            {amount(booking.paid)}
            <span className="block text-sm text-natural-500">
              {t("outstanding", {
                amount: amount({
                  amountMinor: outstandingMinor,
                  currency: booking.total.currency,
                }),
              })}
            </span>
            {atCheckInMinor > 0 ? (
              <span className="block text-sm text-natural-500">
                {t("dueAtCheckIn", {
                  amount: amount({
                    amountMinor: atCheckInMinor,
                    currency: booking.total.currency,
                  }),
                })}
              </span>
            ) : null}
          </Field>
          <Field label={t("fields.timeline")}>
            <span className="block text-sm text-natural-500">
              {t("createdAt", { at: at(booking.createdAt) })}
            </span>
            {booking.holdExpiresAt ? (
              <span className="block text-sm text-natural-500">
                {t("holdExpiresAt", { at: at(booking.holdExpiresAt) })}
              </span>
            ) : null}
            {booking.confirmedAt ? (
              <span className="block text-sm text-natural-500">
                {t("confirmedAt", { at: at(booking.confirmedAt) })}
              </span>
            ) : null}
            {booking.cancelledAt ? (
              <span className="block text-sm text-natural-500">
                {t("cancelledAt", { at: at(booking.cancelledAt) })}
              </span>
            ) : null}
          </Field>
        </dl>

        {booking.cancelReason ? (
          <p className="rounded-xl bg-natural-50 p-4 text-sm text-foreground">
            {t("cancelReason", { reason: booking.cancelReason })}
          </p>
        ) : null}
      </section>

      {booking.invoice ? (
        <section className="flex flex-col gap-3 rounded-2xl border border-natural-100 bg-card p-5">
          <h2 className="text-lg font-bold text-foreground">{t("invoice.title")}</h2>
          <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field label={t("invoice.number")}>{booking.invoice.number}</Field>
            <Field label={t("invoice.amount")}>{amount(booking.invoice.amount)}</Field>
            <Field label={t("invoice.status")}>{tInvoiceStatus(booking.invoice.status)}</Field>
            <Field label={t("invoice.billedTo")}>
              <span className="block">{booking.invoice.billingName ?? "—"}</span>
              <span className="block text-sm text-natural-500">{booking.invoice.billingEmail}</span>
              {booking.invoice.companyName ? (
                <span className="block text-sm text-natural-500">
                  {booking.invoice.companyName}
                  {booking.invoice.vatNumber ? ` · ${booking.invoice.vatNumber}` : ""}
                </span>
              ) : null}
            </Field>
            <Field label={t("invoice.issued")}>{at(booking.invoice.issuedAt)}</Field>
            <Field label={t("invoice.due")}>{at(booking.invoice.dueAt)}</Field>
          </dl>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
        <h2 className="border-b border-natural-50 p-5 text-lg font-bold text-foreground">
          {t("payments.title")}
        </h2>
        <div className="p-5">
          {booking.payments.length === 0 ? (
            <p className="text-sm text-natural-500">{t("payments.empty")}</p>
          ) : (
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("payments.kind")}</TableHead>
                  <TableHead>{t("payments.amount")}</TableHead>
                  <TableHead>{t("payments.method")}</TableHead>
                  <TableHead>{t("payments.status")}</TableHead>
                  <TableHead>{t("payments.paidAt")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {booking.payments.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      {tDetail(`kind.${entry.kind}`)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium text-foreground">
                      {amount(entry.amount)}
                    </TableCell>
                    <TableCell>{t(`payments.methods.${entry.method}`)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip variant={chipVariant(PAYMENT_VARIANTS, entry.status)}>
                          {tDetail(`paymentStatus.${entry.status}`)}
                        </Chip>
                        {/* A chargeback is the one thing on this table that changes what staff
                            should do next, so it is called out rather than left to `status`.
                            The state is Stripe's own word for where the dispute stands and is
                            shown as it came; only the "no state yet" fallback is ours. */}
                        {entry.disputedAt ? (
                          <Chip variant="error">
                            {t("payments.disputed", {
                              state: entry.disputeStatus ?? t("payments.disputeStatus.open"),
                            })}
                          </Chip>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-natural-500">
                      {at(entry.paidAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
        <h2 className="border-b border-natural-50 p-5 text-lg font-bold text-foreground">
          {t("schedule.title")}
        </h2>
        <div className="p-5">
          {booking.paymentSchedule.length === 0 ? (
            <p className="text-sm text-natural-500">{t("schedule.empty")}</p>
          ) : (
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("schedule.kind")}</TableHead>
                  <TableHead>{t("schedule.amount")}</TableHead>
                  <TableHead>{t("schedule.dueAt")}</TableHead>
                  <TableHead>{t("schedule.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {booking.paymentSchedule.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap">
                      {tDetail(`kind.${entry.kind}`)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium text-foreground">
                      {amount(entry.amount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-natural-500">
                      {at(entry.dueAt)}
                    </TableCell>
                    <TableCell>{t(`schedule.statuses.${entry.status}`)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
        <h2 className="border-b border-natural-50 p-5 text-lg font-bold text-foreground">
          {t("priceLines.title")}
        </h2>
        <div className="flex flex-col gap-2 p-5">
          {booking.priceLines.map((line) => (
            <div key={line.code} className="flex items-baseline justify-between gap-4">
              <span className="text-base text-foreground">{line.label}</span>
              <span className="whitespace-nowrap font-medium text-foreground">
                {amount(line.amount)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

/*
 * Marks a booking as test data, or puts it back.
 *
 * No confirmation step, deliberately. The flag changes nothing about the booking
 * itself - status, payments and the provider reservation are untouched - it is
 * fully reversible from this same button, and every change writes an audit entry
 * naming who made it. A dialog here would be friction standing in front of a
 * decision that costs nothing to undo. Cancelling a booking, which does move real
 * money, keeps its dialog.
 */
/*
 * The two writes this screen can make, in one strip rather than two: both act on the booking as
 * a whole, and a colleague deciding between them is choosing whether this was real business at
 * all or business that is not happening.
 */
function StaffActions({
  booking,
  providerLabel,
}: {
  booking: BookingAdminDetail;
  providerLabel: string;
}) {
  const t = useTranslations("Admin.StaffBooking");
  const format = useFormatter();
  const setExcluded = useSetBookingExcluded();
  const [cancelling, setCancelling] = useState(false);
  const isExcluded = booking.excludedAt !== null;

  return (
    <div className="flex flex-col gap-2 border-t border-natural-100 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        {UNCANCELLABLE.includes(booking.status) ? null : (
          <Button variant="destructive" size="sm" onClick={() => setCancelling(true)}>
            {t("cancel.action")}
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={setExcluded.isPending}
          onClick={() => setExcluded.mutate({ id: booking.id, excluded: !isExcluded })}
        >
          {isExcluded ? t("excluded.restore") : t("excluded.exclude")}
        </Button>
        {isExcluded && booking.excludedAt ? (
          <span className="text-sm text-natural-500">
            {t("excluded.excludedAt", {
              at: format.dateTime(new Date(booking.excludedAt), {
                dateStyle: "medium",
                timeStyle: "short",
              }),
            })}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-natural-500">{t("excluded.help")}</p>

      <AdminCancelBookingDialog
        booking={booking}
        providerLabel={providerLabel}
        open={cancelling}
        onOpenChange={setCancelling}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm font-semibold text-natural-500">{label}</dt>
      <dd className="text-base text-foreground">{children}</dd>
    </div>
  );
}
