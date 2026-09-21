"use client";

import type { OfferConstraints } from "@yacht-charter/api/lib/offer-availability";
import { ScrollArea } from "@yacht-charter/ui/components/layout/scroll-area";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useTranslations } from "next-intl";

import { STAT_TONE } from "@/components/shared/data-display/yacht-card/parts";
import type { CharterPeriod } from "@/components/shared/form/charter-date-field";
import type { AppPathname } from "@/i18n/navigation";

import type { Quote } from "../../api/queries";
import type { RateSource } from "../../lib/line-rate";
import type { CrewType } from "../../types";
import { CharterOptions } from "./charter-options";
import { CharterPeriodField } from "./charter-period-field";
import { CreditField } from "./credit-field";
import { DiscountRows } from "./discount-rows";
import { PaymentSchedule } from "./payment-schedule";
import { PriceHeadline } from "./price-headline";
import { GROUPS, PriceGroup } from "./price-group";
import { PromoField } from "./promo-field";
import { Separator } from "./separator";
import { SummaryCta } from "./summary-cta";
import { SummaryEmptyState, SummaryLoadError } from "./summary-empty-state";

export interface BookingSummaryProps {
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
  /*
   * The period the visitor arrived with, when this listing will not sell it. Named rather than
   * merely refused: they picked these dates in search or followed a shared link, and a bare
   * "choose another period" leaves them guessing which dates were even considered.
   */
  refusedPeriod?: { checkIn: string; checkOut: string } | null;
  /**
   * The quote this screen was opened with could not be read at all, so there is nothing to
   * price and nothing the date controls can fix. Separate from `slotError`, which is the
   * provider declining one period out of a working quote.
   */
  loadError?: boolean;
  /** Asks for that quote again. Omitted where nothing was loaded by id in the first place. */
  onRetryLoad?: () => void;
  /** The vendor could not price the chosen period; see `pricingFailed` on the booking context. */
  pricingFailed?: boolean;
  onRetryPricing?: () => void;
  /** The marina's wall-clock check-in/out, shown beneath each charter date. */
  /**
   * The listing's reduced deposit, for the note under the deposit figure. Comes from the
   * catalogue rather than the quote: it advertises what the damage waiver would do BEFORE the
   * guest selects it, at which point the quote's own `securityDeposit` becomes the lower figure
   * and this note has nothing left to say.
   */
  depositWhenInsured?: { amountMinor: number; currency: string } | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  /** The listing's extras, so a fee billed per night or per person says so beside its total. */
  extraRates?: readonly RateSource[];
  crewType: CrewType | undefined;
  crewOptions: readonly CrewType[];
  onCrewChange: (next: CrewType) => void;
  /** Picks one of a crew role's variants; absent where the summary is read-only. */
  onCrewVariantChange?: (code: string) => void;
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
   * Set when this yacht's operator confirms each booking by hand: Pay Now becomes a booking
   * request for the quoted charter, since the checkout would refuse the hold.
   */
  onRequestBooking?: () => void;
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
}

export default function BookingSummary({
  quote,
  loading = false,
  stats,
  offers,
  selectedPeriod,
  onPeriodSelect,
  slotError = false,
  refusedPeriod = null,
  loadError = false,
  onRetryLoad,
  pricingFailed = false,
  onRetryPricing,
  depositWhenInsured,
  checkInTime,
  checkOutTime,
  extraRates,
  crewType,
  crewOptions,
  onCrewChange,
  onCrewVariantChange,
  onDropOffChange,
  guests,
  onGuestsChange,
  unavailable = false,
  datesOnRequest = false,
  actions = true,
  shaded = false,
  payNowHref,
  onRequestQuote,
  onRequestBooking,
  onApplyPromo,
  onApplyCredit,
}: BookingSummaryProps) {
  const tCard = useTranslations("Common.boatCard");

  /*
   * A reprice keeps the previous quote on screen while the new one is in flight, so
   * every amount below is stale until it lands. Headline figures become skeletons and
   * the breakdown dims: without it a changed date looks like it did nothing.
   */
  const repricing = loading && quote !== null;

  const discounts = quote?.lines.filter((line) => line.kind === "discount") ?? [];
  /* Applied wins: once credit is on the quote, `creditAvailable` is what it is still worth,
     not a second offer to make. */
  const creditOffer = quote?.creditApplied ?? quote?.creditAvailable ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <ScrollArea className="min-h-0 flex-1 max-xl:**:data-[slot=scroll-area-viewport]:overscroll-auto">
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
          <CharterPeriodField
            quote={quote}
            loading={loading}
            offers={offers}
            selectedPeriod={selectedPeriod}
            onPeriodSelect={onPeriodSelect}
            slotError={slotError}
            pricingFailed={pricingFailed}
            onRetryPricing={onRetryPricing}
            refusedPeriod={refusedPeriod}
            checkInTime={checkInTime}
            checkOutTime={checkOutTime}
            unavailable={unavailable}
          />

          <CharterOptions
            quote={quote}
            crewType={crewType}
            crewOptions={crewOptions}
            onCrewChange={onCrewChange}
            onCrewVariantChange={onCrewVariantChange}
            onDropOffChange={onDropOffChange}
            guests={guests}
            onGuestsChange={onGuestsChange}
          />

          {/* Where the breakdown would be. A failed load leaves the controls usable - picking a
              period prices a fresh quote and needs no retry - so this replaces the numbers
              rather than the panel.

              A known failure outranks `loading` here and in the placeholder below, rather than
              the two racing: the sidebar was showing this message above a spinner, which is two
              answers to one question, and a `loading` left stale by a rejected read would spin
              forever under it. `loadError` is cleared the moment a retry starts, so the spinner
              is what shows while one is actually running. */}
          {loadError && !quote ? <SummaryLoadError onRetryLoad={onRetryLoad} /> : null}

          {quote ? (
            <PriceHeadline
              quote={quote}
              repricing={repricing}
              depositWhenInsured={depositWhenInsured}
            />
          ) : null}
        </div>

        {quote ? (
          <>
            <Separator />

            {GROUPS.map(({ groups, labelKey }) => {
              const lines = quote.lines.filter((line) => groups.includes(line.group));
              if (lines.length === 0) return null;
              return (
                <div
                  key={labelKey}
                  className={cn(
                    "flex w-full flex-col py-4 transition-opacity",
                    shaded && "border-b border-border bg-natural-50",
                    repricing && "opacity-40",
                  )}
                  aria-busy={repricing}
                >
                  <PriceGroup labelKey={labelKey} lines={lines} catalogue={extraRates} />
                </div>
              );
            })}

            {quote.paymentSchedule.length ? (
              <div className={cn("transition-opacity", repricing && "opacity-40")}>
                <PaymentSchedule entries={quote.paymentSchedule} lines={quote.lines} />
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
          </>
        ) : (
          <SummaryEmptyState
            loading={loading}
            unavailable={unavailable}
            datesOnRequest={datesOnRequest}
            loadError={loadError}
            actions={actions}
            onRequestQuote={onRequestQuote}
          />
        )}
      </ScrollArea>

      {/* Outside the ScrollArea on purpose: on a tall quote the payable figures and the CTA
          used to sit below the fold, so the page opened without saying what there was to pay.
          Only pins from `xl`, where SplitPanels caps the aside at viewport height; below that
          the card is its own tab panel with no cap, so this simply ends it as it always did. */}
      {quote ? (
        <SummaryCta
          quote={quote}
          repricing={repricing}
          actions={actions}
          payNowHref={payNowHref}
          onRequestQuote={onRequestQuote}
          onRequestBooking={onRequestBooking}
        />
      ) : null}
    </div>
  );
}
