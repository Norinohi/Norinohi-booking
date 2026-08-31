"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import type { OfferConstraints } from "@yacht-charter/api/lib/offer-availability";
import { Select } from "@yacht-charter/ui/components/form/select";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { Slider } from "@yacht-charter/ui/components/form/slider";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { ScrollArea } from "@yacht-charter/ui/components/layout/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@yacht-charter/ui/components/layout/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowRight, Calendar, ChevronDown, CircleCheckBig, Info } from "lucide-react";
import type { AppPathname } from "@/i18n/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";

import { STAT_TONE } from "@/components/shared/data-display/boat-card";
import { Image } from "@/components/shared/data-display/image";
import CharterDateField, { type CharterPeriod } from "@/components/shared/form/charter-date-field";
import Loader from "@/components/shared/feedback/loader";
import { useMoney } from "@/hooks/use-money";
import { dayToDisplay } from "@/lib/date";

import type { Quote, QuoteLine } from "@/features/booking/api/queries";

export type CrewType = NonNullable<Quote["crewType"]>;

/** Quote line `group` → the sidebar section it renders under (i18n key on `sidebar.groups`). */
const GROUPS = [
  { group: "mandatory", labelKey: "mandatory" },
  { group: "optional", labelKey: "selectedExtras" },
  { group: "crew", labelKey: "crew" },
] as const;

/** Payment-schedule `kind` → the amount-caption message on `sidebar.*`. */
const SCHEDULE_AMOUNT_KEY = {
  deposit: "firstPayment",
  full: "firstPayment",
  balance: "secondPayment",
  checkin_extras: "extrasPayment",
  security_deposit: "depositNote",
} as const satisfies Record<Quote["paymentSchedule"][number]["kind"], string>;

const PEOPLE_MIN = 1;
const PEOPLE_MAX = 20;

const NBSP = "\u00A0";

export type BookingSummaryProps = {
  /** The live quote to render, or `null` before a valid selection has been priced. */
  quote: Quote | null;
  /** A quote/reprice request is in flight — the breakdown is dimmed under a loader. */
  loading?: boolean;
  stats?: { booked: number; viewed: number } | null;

  offers: readonly OfferConstraints[];
  selectedPeriod: CharterPeriod | undefined;
  onPeriodSelect: (period: CharterPeriod) => void;
  /** The provider refused the last pick — shown under the date control. */
  slotError?: boolean;
  /**
   * The quote this screen was opened with could not be read at all, so there is nothing to
   * price and nothing the date controls can fix. Separate from `slotError`, which is the
   * provider declining one period out of a working quote.
   */
  loadError?: boolean;
  /** Asks for that quote again. Omitted where nothing was loaded by id in the first place. */
  onRetryLoad?: () => void;
  /** The marina's wall-clock check-in/out, shown beneath each charter date. */
  checkInTime?: string | null;
  checkOutTime?: string | null;
  crewType: CrewType | undefined;
  crewOptions: readonly CrewType[];
  onCrewChange: (next: CrewType) => void;
  /** Null clears a one-way, returning the yacht to the base it left from. */
  onDropOffChange?: (endBaseId: string | null) => void;
  guests: number;
  onGuestsChange: (next: number) => void;

  /**
   * The listing has no bookable slot at all. Locks the date picker and swaps the panel for an
   * enquiry prompt, so the flow never opens on a yacht that cannot be quoted.
   */
  unavailable?: boolean;
  /**
   * Dates exist, but the operator publishes no rate for them.
   *
   * Distinct from `unavailable` because the answer is opposite: that boat has nothing
   * to sell, this one has everything to sell and no price on it. Without the
   * distinction the panel fell through to "select your dates to see the price" beside
   * a calendar that refuses every day, which is the one reading that is simply untrue.
   */
  datesOnRequest?: boolean;
  /** The Pay Now / Request Quote pair. The booking flow has its own CTA, so it hides them. */
  actions?: boolean;
  /** Lifts the price groups onto the neutral background (Figma: booking flow only). */
  shaded?: boolean;
  /** Where Pay Now leads — set once a quote exists so the id can ride along. */
  payNowHref?: AppPathname;
  /** Opens the Request Quote enquiry dialog — supplied by the sidebar container (detail page only). */
  onRequestQuote?: () => void;
  /**
   * Applies a promo code to the current quote, or clears it with `null`. Omitted when there is
   * nothing to apply one to — before a quote exists, and once a booking has been held off it.
   */
  onApplyPromo?: (code: string | null) => void;
  /**
   * Spends the caller's referral credit on the quote, or takes it back off. Omitted under the
   * same conditions as `onApplyPromo`; the block itself hides when the quote offers no credit.
   */
  onApplyCredit?: (spend: boolean) => void;
};

function Separator() {
  return <span aria-hidden className="h-px w-full shrink-0 bg-border" />;
}

/** The marina's own wall-clock time sits under the day, unconverted — see `BoatCardCharterDate`. */
function CharterPoint({ date, time }: { date: string; time: string | null }) {
  const format = useFormatter();
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-base leading-5.5 font-bold whitespace-nowrap text-foreground">
        {format.dateTime(dayToDisplay(date), "dayShort")}
      </p>
      {time ? <p className="text-sm leading-4.5 font-medium text-natural-500">{time}</p> : null}
    </div>
  );
}

/*
 * The promo code box. The quote is the single source of truth for what happened: `discount`
 * once a code was accepted, `discountRejected` with the reason when one was not — the server
 * still prices the charter without it rather than failing, so this explains instead of erroring.
 * Applying and removing are both reprices, which is why the whole box locks while one is in flight.
 */
function PromoField({
  applied,
  rejected,
  pending,
  currency,
  onApply,
}: {
  applied: NonNullable<Quote>["discount"];
  rejected: NonNullable<Quote>["discountRejected"];
  pending: boolean;
  /* The discount is a share of the quote and carries no currency of its own. */
  currency: string;
  onApply: (code: string | null) => void;
}) {
  const t = useTranslations("YachtDetail.sidebar.promo");
  const money = useMoney();
  const [code, setCode] = useState("");

  if (applied) {
    return (
      <div className="flex w-full items-center gap-2 p-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-base leading-5.5 font-bold text-foreground">{applied.code}</p>
          <p className="text-sm leading-4.5 font-medium text-positive-600">
            {t("applied", { amount: money(applied.amountMinor, currency) })}
          </p>
        </div>
        <Button variant="subtle" size="sm" loading={pending} onClick={() => onApply(null)}>
          {t("remove")}
        </Button>
      </div>
    );
  }

  const submit = () => {
    const trimmed = code.trim();
    if (trimmed.length > 0) onApply(trimmed);
  };

  return (
    <div className="flex w-full flex-col gap-2 p-4">
      {/* `items-end` aligns the button to the bottom of the field's column, so the label above
          the input does not push the two out of line; the explicit h-12 matches the field to
          the button's own 48px rather than leaving it at whatever its padding computes to. */}
      <div className="flex items-end gap-2">
        <TextField
          containerClassName="min-w-0 flex-1"
          fieldClassName="h-12"
          label={t("label")}
          placeholder={t("placeholder")}
          value={code}
          status={rejected ? "error" : undefined}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            // The sidebar sits inside no form of its own, but the booking wizard wraps it in
            // one — Enter here must apply the code, never submit the step.
            event.preventDefault();
            submit();
          }}
        />
        <Button
          variant="neutral"
          className="shrink-0"
          loading={pending}
          disabled={code.trim().length === 0}
          onClick={submit}
        >
          {t("apply")}
        </Button>
      </div>
      {rejected ? (
        <p className="text-sm leading-4.5 font-medium text-error-500">
          {t(`rejected.${rejected}`)}
        </p>
      ) : null}
    </div>
  );
}

/*
 * Referral credit. The quote reports both halves — `creditAvailable` is what the balance could
 * absorb here, `creditApplied` is what it is absorbing — so this needs no separate balance read,
 * and it renders nothing for a visitor with no credit or a trip under the credit minimum.
 */
function CreditField({
  offer,
  applied,
  pending,
  onApply,
}: {
  offer: NonNullable<NonNullable<Quote>["creditAvailable"]>;
  applied: boolean;
  pending: boolean;
  onApply: (spend: boolean) => void;
}) {
  const t = useTranslations("YachtDetail.sidebar.credit");
  const money = useMoney();

  return (
    <div className="flex w-full items-center gap-2 p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="truncate text-base leading-5.5 font-bold text-foreground">{t("label")}</p>
        <p
          className={cn(
            "text-sm leading-4.5 font-medium",
            applied ? "text-positive-600" : "text-natural-500",
          )}
        >
          {t(applied ? "applied" : "available", {
            amount: money(offer.amountMinor, offer.currency),
          })}
        </p>
      </div>
      <Button
        variant={applied ? "subtle" : "neutral"}
        size="sm"
        loading={pending}
        onClick={() => onApply(!applied)}
      >
        {t(applied ? "remove" : "apply")}
      </Button>
    </div>
  );
}

/*
 * Every discount on the quote, listed. Discount lines carry no `group` (see `QuoteLine`), so
 * the sections above cannot show them, and until they were rendered here the money simply
 * vanished: a provider discount moved the total with nothing on screen to account for it.
 * One row per line rather than a single summed "Discounts" — a provider discount, a promo code
 * and the referral welcome are different things, and the labels are the only place that shows.
 */
/**
 * Our own line names, as opposed to the provider's.
 *
 * A discount the operator configured carries its own name and is data; these two are copy this
 * app writes, so they live in the message files. A code with no entry keeps the label the API
 * sent, which is what an operator-named promo needs.
 */
const QUOTE_LINE_KEY = new Map<string, "referral-welcome" | "referral-credit">([
  ["referral-welcome", "referral-welcome"],
  ["referral-credit", "referral-credit"],
]);

function useQuoteLineLabel() {
  const t = useTranslations("Common.quoteLines");
  return (line: QuoteLine) => {
    const key = QUOTE_LINE_KEY.get(line.code);
    return key ? t(key) : line.label;
  };
}

function DiscountRows({ lines }: { lines: QuoteLine[] }) {
  const money = useMoney();
  const labelOf = useQuoteLineLabel();

  return (
    <div className="flex w-full flex-col gap-3 p-4">
      {lines.map((line) => (
        <div key={line.code} className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-base leading-5.5 text-foreground">{labelOf(line)}</p>
          <p className="shrink-0 text-base leading-5.5 font-bold text-positive-600">
            {money(line.amount.amountMinor, line.amount.currency)}
          </p>
        </div>
      ))}
    </div>
  );
}

function PriceGroup({
  labelKey,
  lines,
}: {
  labelKey: (typeof GROUPS)[number]["labelKey"];
  lines: QuoteLine[];
}) {
  const t = useTranslations("YachtDetail");
  const tExtras = useTranslations("Common.extras");
  const money = useMoney();

  return (
    <Accordion defaultValue={[labelKey]}>
      <AccordionItem value={labelKey}>
        <AccordionTrigger
          className="h-7 px-4"
          indicator={
            <ChevronDown className="size-5 shrink-0 text-foreground transition-transform duration-200 group-data-panel-open:rotate-180" />
          }
        >
          <span className="text-xl text-foreground">{t(`sidebar.groups.${labelKey}`)}</span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col pt-3">
            {lines.map((line, index) => (
              <div key={line.code} className="flex flex-col">
                {index > 0 ? (
                  <span aria-hidden className="mt-3 mb-2.75 h-px w-full bg-border" />
                ) : null}
                <div className="flex items-start gap-2 px-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-base leading-5.5 text-foreground">{line.label}</p>
                    {/* A line the charter already covers is collected nowhere, so naming a
                        moment to pay it is naming a payment nobody will make. */}
                    {line.payWhen === "at_check_in" && line.amount.amountMinor !== 0 ? (
                      <p className="text-xs font-semibold text-natural-500">
                        {tExtras("payAtCheckIn")}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-base leading-5.5 font-bold text-foreground">
                    {line.amount.amountMinor === 0
                      ? tExtras("includedInPrice")
                      : money(line.amount.amountMinor, line.amount.currency)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function PaymentSchedule({ entries }: { entries: Quote["paymentSchedule"] }) {
  const t = useTranslations("YachtDetail");
  const format = useFormatter();
  const money = useMoney();

  const when = (entry: Quote["paymentSchedule"][number]) => {
    if (!entry.dueAt) return t("sidebar.payNow");
    /* Non-breaking inside the date, so a narrow column wraps before it rather than through
       it — otherwise the Ukrainian "р." lands alone on a line of its own. */
    const date = format.dateTime(dayToDisplay(entry.dueAt), "dayShort").replaceAll(" ", NBSP);
    return entry.kind === "checkin_extras" || entry.kind === "security_deposit"
      ? t("sidebar.payAtCheckIn", { date })
      : t("sidebar.payAt", { date });
  };

  return (
    <div className="flex gap-3 px-4 py-4">
      <div className="relative flex w-4 shrink-0 justify-center">
        <span aria-hidden className="absolute inset-y-2 border-l-4 border-dotted border-border" />
        <span aria-hidden className="relative h-8 w-1 shrink-0 rounded-full bg-foreground" />
      </div>

      <ol className="flex min-w-0 flex-1 flex-col gap-12">
        {entries.map((entry) => (
          <li key={entry.kind} className="flex flex-col gap-1">
            <Chip className="gap-1 bg-transparent p-0 text-sm leading-4.5 font-medium text-natural-500">
              {entry.dueAt ? <Calendar className="shrink-0" /> : null}
              {when(entry)}
            </Chip>
            <p className="text-base leading-5.5 font-bold text-foreground">
              {t(`sidebar.${SCHEDULE_AMOUNT_KEY[entry.kind]}`, {
                amount: money(entry.amount.amountMinor, entry.amount.currency),
              })}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function BookingSummary({
  quote,
  loading = false,
  stats,
  offers,
  selectedPeriod,
  onPeriodSelect,
  slotError = false,
  loadError = false,
  onRetryLoad,
  checkInTime,
  checkOutTime,
  crewType,
  crewOptions,
  onCrewChange,
  onDropOffChange,
  guests,
  onGuestsChange,
  unavailable = false,
  datesOnRequest = false,
  actions = true,
  shaded = false,
  payNowHref,
  onRequestQuote,
  onApplyPromo,
  onApplyCredit,
}: BookingSummaryProps) {
  const t = useTranslations("YachtDetail");
  const tCard = useTranslations("Common.boatCard");
  const tCrew = useTranslations("Common.crewTypes");

  /*
   * Where this charter may finish, given where it starts.
   *
   * The provider varies both ends independently, so a week can come back with four routes of
   * which two share a drop-off - Carrick to Carrick and Portumna to Carrick both end at
   * Carrick. Offering those raw gave the select duplicate values and let a drop-off control
   * silently move the pickup, which is not a thing the customer was asked about. Pinning the
   * start to the route already quoted leaves exactly one decision: where to leave the yacht.
   */
  const startBaseId = quote?.route?.startBaseId;
  const dropOffOptions = (quote?.routeOptions ?? []).filter(
    (option) => option.startBaseId === startBaseId,
  );
  /*
   * Where the charter actually begins, which is not always the base the listing advertises.
   * A hull left at the far end of its run is offered from there, so the Shannon boat whose page
   * says Carrick on Shannon departs Portumna on some weeks. Without this the drop-off control
   * read as a choice between "the charter base" and somewhere else, and picking what looked
   * like the charter base added a one-way fee that was, against the real start, entirely correct.
   */
  const pickUpBaseName = dropOffOptions[0]?.startBaseName;

  /*
   * Where this particular charter is collected, which is not always where the listing lives.
   *
   * A hull left at the far end of a one-way run is offered from there for the following weeks,
   * so the page can advertise Carrick while every offer that week departs Portumna. Without
   * this the drop-off control read as a choice between the same marina and a different one,
   * and picking "Carrick" looked like staying put when it was in fact the one-way.
   *
   * Shown only when it tells the customer something they could not already see: a departure
   * away from the advertised base, or a week where the ending is theirs to choose.
   */

  const money = useMoney();
  const peoplePercent = ((guests - PEOPLE_MIN) / (PEOPLE_MAX - PEOPLE_MIN)) * 100;
  /*
   * A reprice keeps the previous quote on screen while the new one is in flight, so
   * every amount below is stale until it lands. Headline figures become skeletons and
   * the breakdown dims: without it a changed date looks like it did nothing.
   */
  const repricing = loading && quote !== null;
  /* Never hand Pay Now a live link over a stale amount. */
  const payNowReady = payNowHref !== undefined && !repricing;

  const base = quote?.lines.find((line) => line.kind === "base");
  const discounts = quote?.lines.filter((line) => line.kind === "discount") ?? [];
  /* Applied wins: once credit is on the quote, `creditAvailable` is what it is still worth,
     not a second offer to make. */
  const creditOffer = quote?.creditApplied ?? quote?.creditAvailable ?? null;
  const rawPct = quote
    ? quote.paymentPolicy.mode === "full"
      ? 100
      : quote.paymentPolicy.depositPct
    : 0;
  const prepaymentPercent = rawPct > 1 ? Math.round(rawPct) : Math.round(rawPct * 100);
  /*
   * A zero deposit is the operator saying it takes none, which the card already reads that way
   * and omits. The sidebar printed it as "Refundable deposit EUR 0" beside a gulet whose crew,
   * linen and cleaning it was also pricing at zero -- a column of nothings where the honest
   * answer is one fewer line.
   */
  const deposit =
    quote?.securityDeposit && quote.securityDeposit.amountMinor > 0 ? quote.securityDeposit : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <ScrollArea className="min-h-0 flex-1 max-xl:[&_[data-slot=scroll-area-viewport]]:overscroll-auto">
        {/* Real counts, so either can be zero — a line with nothing to report is
            dropped, and the block goes with it when both are. */}
        {stats && (stats.booked > 0 || stats.viewed > 0) ? (
          <>
            <div className="flex w-full flex-col gap-2 p-4 text-sm leading-4.5 font-medium">
              {stats.booked > 0 ? (
                <p className={STAT_TONE.booked}>{tCard("stats.booked", { count: stats.booked })}</p>
              ) : null}
              {stats.viewed > 0 ? (
                <p className={STAT_TONE.viewed}>{tCard("stats.viewed", { count: stats.viewed })}</p>
              ) : null}
            </div>
            <Separator />
          </>
        ) : null}

        <div className="flex w-full flex-col gap-3 p-4">
          {quote ? (
            <div className="flex items-center justify-between gap-2">
              <CharterPoint date={quote.checkIn} time={checkInTime ?? null} />
              <ArrowRight className="size-4 shrink-0 text-natural-300" />
              <CharterPoint date={quote.checkOut} time={checkOutTime ?? null} />
            </div>
          ) : null}

          <CharterDateField
            offers={offers}
            value={selectedPeriod}
            onSelect={onPeriodSelect}
            disabled={unavailable}
            placeholder={t("sidebar.datesPlaceholder")}
            triggerClassName="h-12"
          />
          {slotError ? (
            <p className="text-sm font-medium text-error-600">{t("sidebar.slotRefused")}</p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm leading-4.25 font-semibold text-foreground">
              {t("sidebar.crew")}
            </span>
            <Select
              className="h-12"
              options={crewOptions.map((option) => ({ value: option, label: tCrew(option) }))}
              value={crewType ?? ""}
              onValueChange={(value) => {
                const next = crewOptions.find((option) => option === value);
                if (next) onCrewChange(next);
              }}
            />
          </div>

          {/* Only where the provider offered a real choice of ending. One drop-off is not a
              decision, and a fleet that never sells one-way must not grow a control implying
              it does. */}
          {onDropOffChange && dropOffOptions.length > 1 ? (
            <div className="flex flex-col gap-1.5">
              {pickUpBaseName ? (
                <span className="text-sm leading-4.25 font-medium text-natural-300">
                  {t("sidebar.pickUp", { marina: pickUpBaseName })}
                </span>
              ) : null}
              <span className="text-sm leading-4.25 font-semibold text-foreground">
                {t("sidebar.dropOff")}
              </span>
              <Select
                className="h-12"
                options={dropOffOptions.map((option) => ({
                  value: option.endBaseId ?? "",
                  label: option.endBaseName ?? "",
                }))}
                value={quote?.route?.endBaseId ?? ""}
                onValueChange={(value) => {
                  const chosen = dropOffOptions.find((option) => option.endBaseId === value);
                  // Returning to the start base is the absence of a one-way, not a one-way to
                  // where you began, so it clears the choice rather than restating it.
                  onDropOffChange(chosen && chosen.isOneWay ? value : null);
                }}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="text-sm leading-4.25 font-semibold text-foreground">
              {t("sidebar.people")}
            </span>
            <div className="flex items-center justify-between text-sm leading-4.5 font-medium text-foreground">
              <span>{PEOPLE_MIN}</span>
              <span>{PEOPLE_MAX}+</span>
            </div>
            <Slider
              min={PEOPLE_MIN}
              max={PEOPLE_MAX}
              value={guests}
              onValueChange={(value) => {
                // SAFETY: the slider is given a scalar `value`, so it renders one thumb and
                // reports a scalar back; only a tuple value would make this an array.
                onGuestsChange(value as number);
              }}
            />
            <div className="relative h-4.5">
              <span
                className="absolute -translate-x-1/2 text-sm font-medium text-foreground"
                style={{ left: `${peoplePercent}%` }}
              >
                {guests}
              </span>
            </div>
          </div>

          {/* Where the breakdown would be. A failed load leaves the controls usable - picking a
              period prices a fresh quote and needs no retry - so this replaces the numbers
              rather than the panel.

              A known failure outranks `loading` here and in the placeholder below, rather than
              the two racing: the sidebar was showing this message above a spinner, which is two
              answers to one question, and a `loading` left stale by a rejected read would spin
              forever under it. `loadError` is cleared the moment a retry starts, so the spinner
              is what shows while one is actually running. */}
          {loadError && !quote ? (
            <div className="flex flex-col items-start gap-2 rounded-lg bg-error-50 px-4 py-3">
              <span className="text-sm leading-4.5 font-medium text-error-600">
                {t("sidebar.loadFailed")}
              </span>
              {onRetryLoad ? (
                <button
                  type="button"
                  onClick={onRetryLoad}
                  className="text-sm leading-4.5 font-bold text-error-600 underline underline-offset-2"
                >
                  {t("sidebar.loadRetry")}
                </button>
              ) : null}
            </div>
          ) : null}

          {quote ? (
            <>
              <div className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-50 px-4 py-3">
                <CircleCheckBig className="size-4 shrink-0 text-brand" />
                <span className="text-sm leading-4.5 font-bold text-brand">
                  {t("sidebar.prepayment", { percent: prepaymentPercent })}
                </span>
              </div>

              {/*
                One grid, filled column by column, so the two figures share their rows: label,
                amount, footnote. However the labels wrap at this width, the amounts stay on
                one line, and a short label bottom-aligns against its neighbour's last line.
                The explanation the price label used to carry in brackets is the footnote now,
                where it can run long without pushing the amount down.
              */}
              <div
                className={cn(
                  "grid grid-flow-col grid-rows-[auto_auto_auto] gap-x-1.5 gap-y-1",
                  deposit ? "grid-cols-2" : "grid-cols-1",
                )}
              >
                <p className="self-end text-sm leading-4.5 font-medium text-natural-500">
                  {t("sidebar.boatPrice")}
                </p>
                {repricing ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <p className="text-2xl leading-8 font-semibold text-foreground">
                    {money((base ?? quote.lines[0])?.amount.amountMinor ?? 0, quote.total.currency)}
                  </p>
                )}
                <p className="text-xs leading-4 font-medium text-natural-500">
                  {t("sidebar.boatPriceHint")}
                </p>

                {deposit ? (
                  <>
                    <p className="self-end text-right text-sm leading-4.5 font-medium text-natural-500">
                      {t("sidebar.deposit")}
                    </p>
                    {repricing ? (
                      <Skeleton className="h-8 w-24 justify-self-end" />
                    ) : (
                      <p className="text-right text-2xl leading-8 font-semibold text-foreground">
                        {money(deposit.amountMinor, deposit.currency)}
                      </p>
                    )}
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            className="flex cursor-pointer items-center gap-1 justify-self-end text-xs leading-4 font-semibold text-brand underline decoration-dotted outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          />
                        }
                      >
                        <Info className="size-4 shrink-0" />
                        {t("sidebar.howItWorks")}
                      </TooltipTrigger>
                      <TooltipContent>{tCard("securityDepositInfo")}</TooltipContent>
                    </Tooltip>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        {quote ? (
          <>
            <Separator />

            {GROUPS.map(({ group, labelKey }) => {
              const lines = quote.lines.filter((line) => line.group === group);
              if (lines.length === 0) return null;
              return (
                <div
                  key={group}
                  className={cn(
                    "flex w-full flex-col py-4 transition-opacity",
                    shaded && "border-b border-border bg-natural-50",
                    repricing && "opacity-40",
                  )}
                  aria-busy={repricing}
                >
                  <PriceGroup labelKey={labelKey} lines={lines} />
                </div>
              );
            })}

            {quote.paymentSchedule.length ? (
              <div className={cn("transition-opacity", repricing && "opacity-40")}>
                <PaymentSchedule entries={quote.paymentSchedule} />
              </div>
            ) : null}

            {onApplyPromo ? (
              <>
                <Separator />
                <PromoField
                  applied={quote.discount}
                  rejected={quote.discountRejected}
                  pending={repricing}
                  currency={quote.total.currency}
                  onApply={onApplyPromo}
                />
              </>
            ) : null}

            {onApplyCredit && creditOffer ? (
              <>
                <Separator />
                <CreditField
                  offer={creditOffer}
                  applied={quote.creditApplied !== null}
                  pending={repricing}
                  onApply={onApplyCredit}
                />
              </>
            ) : null}

            {discounts.length ? (
              <>
                <Separator />
                <div
                  className={cn("transition-opacity", repricing && "opacity-40")}
                  aria-busy={repricing}
                >
                  <DiscountRows lines={discounts} />
                </div>
              </>
            ) : null}

            <Separator />

            <div className="flex w-full flex-col items-center gap-1 p-4">
              <p className="text-sm leading-4.5 font-medium text-natural-500">
                {t("sidebar.totalPrice")}
              </p>
              {repricing ? (
                <Skeleton className="h-9 w-32" />
              ) : (
                <p className="text-[32px] leading-9 font-bold text-foreground">
                  {money(quote.total.amountMinor, quote.total.currency)}
                </p>
              )}
              {quote.perPerson ? (
                <p className="text-sm leading-4.5 font-medium text-natural-500">
                  {tCard("perPersonApprox", {
                    price: money(quote.perPerson.amountMinor, quote.perPerson.currency),
                  })}
                </p>
              ) : null}
            </div>

            <Separator />

            <div className="flex w-full flex-col gap-3 p-4">
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm leading-4.5 font-medium text-natural-500">
                  {t("sidebar.dueNow")}
                </p>
                {repricing ? (
                  <Skeleton className="h-14 w-40" />
                ) : (
                  <p className="text-[42px] leading-14 font-bold text-foreground">
                    {money(quote.deposit.amountMinor, quote.deposit.currency)}
                  </p>
                )}
              </div>
              {actions ? (
                <>
                  <Button
                    variant="brand"
                    loading={repricing}
                    disabled={!payNowReady}
                    nativeButton={payNowReady ? false : undefined}
                    render={payNowReady ? <Link href={payNowHref} /> : undefined}
                  >
                    {t("sidebar.payNowCta", {
                      amount: money(quote.deposit.amountMinor, quote.deposit.currency),
                    })}
                  </Button>
                  <Button variant="neutral" onClick={onRequestQuote}>
                    {t("sidebar.requestQuote")}
                  </Button>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex min-h-56 flex-col items-center justify-center gap-4 p-6 text-center">
            {loading && !unavailable && !loadError ? (
              <Loader />
            ) : (
              <>
                <Image
                  src="/assets/illustrations/no-results.svg"
                  alt=""
                  width={128}
                  height={131}
                  unoptimized
                />
                {unavailable ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">
                      {t("sidebar.unavailable")}
                    </p>
                    <p className="text-sm font-medium text-natural-500">
                      {t("sidebar.unavailableHint")}
                    </p>
                    {actions ? (
                      <Button variant="neutral" onClick={onRequestQuote}>
                        {t("sidebar.requestQuote")}
                      </Button>
                    ) : null}
                  </>
                ) : datesOnRequest ? (
                  <>
                    <p className="text-sm font-semibold text-foreground">
                      {t("sidebar.onRequest")}
                    </p>
                    <p className="text-sm font-medium text-natural-500">
                      {t("sidebar.onRequestHint")}
                    </p>
                    {actions ? (
                      <Button variant="neutral" onClick={onRequestQuote}>
                        {t("sidebar.requestQuote")}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm font-medium text-natural-500">{t("sidebar.selectDates")}</p>
                )}
              </>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
