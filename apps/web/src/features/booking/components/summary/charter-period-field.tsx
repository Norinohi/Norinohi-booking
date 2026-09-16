"use client";

import type { OfferConstraints } from "@yacht-charter/api/lib/offer-availability";
import { ArrowRight } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import CharterDateField, { type CharterPeriod } from "@/components/shared/form/charter-date-field";
import { dayToDisplay } from "@/lib/date";

import type { Quote } from "../../api/queries";

/** The marina's own wall-clock time sits under the day, unconverted: see `YachtCardCharterDate`. */
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

export interface CharterPeriodFieldProps {
  quote: Quote | null;
  loading: boolean;
  offers: readonly OfferConstraints[];
  selectedPeriod: CharterPeriod | undefined;
  onPeriodSelect: (period: CharterPeriod) => void;
  slotError: boolean;
  refusedPeriod: { checkIn: string; checkOut: string } | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  unavailable: boolean;
}

/** The quoted charter's two ends, the date control, and what it has to say about the pick. */
export function CharterPeriodField({
  quote,
  loading,
  offers,
  selectedPeriod,
  onPeriodSelect,
  slotError,
  refusedPeriod,
  checkInTime,
  checkOutTime,
  unavailable,
}: CharterPeriodFieldProps) {
  const t = useTranslations("YachtDetail");
  const format = useFormatter();

  return (
    <>
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
      {!slotError && refusedPeriod ? (
        <p className="text-sm font-medium text-error-600">
          {t("sidebar.searchedPeriodRefused", {
            from: format.dateTime(dayToDisplay(refusedPeriod.checkIn), "dayShort"),
            to: format.dateTime(dayToDisplay(refusedPeriod.checkOut), "dayShort"),
          })}
        </p>
      ) : null}
      {/*
       * A card reached without dates shows no price at all, and the empty price area is
       * too far down to read as an instruction. Say it at the control instead.
       *
       * Only once the panel has settled. A page still fetching its constraints may yet
       * open on a period of its own, so saying this over the spinner asks for something
       * the page is in the middle of doing and then takes it back. An empty `offers` is
       * that same wait seen from the other side: the constraints have not arrived, and a
       * boat that really sells nothing is already `unavailable`.
       */}
      {!loading &&
      offers.length > 0 &&
      !slotError &&
      !refusedPeriod &&
      !selectedPeriod &&
      !unavailable ? (
        <p className="text-sm font-semibold text-error-600">{t("sidebar.selectDates")}</p>
      ) : null}
    </>
  );
}
