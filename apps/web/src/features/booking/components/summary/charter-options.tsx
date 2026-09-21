"use client";

import { Select } from "@yacht-charter/ui/components/form/select";
import { Slider } from "@yacht-charter/ui/components/form/slider";
import { useTranslations } from "next-intl";

import { useExactMoney } from "@/hooks/use-money";
import { baseExtraCode, isVariantCode } from "@/lib/extra-code";

import type { Quote } from "../../api/queries";
import type { CrewType } from "../../types";

const PEOPLE_MIN = 1;
const PEOPLE_MAX = 20;

export interface CharterOptionsProps {
  quote: Quote | null;
  crewType: CrewType | undefined;
  crewOptions: readonly CrewType[];
  onCrewChange: (next: CrewType) => void;
  onCrewVariantChange?: ((code: string) => void) | undefined;
  onDropOffChange?: (endBaseId: string | null) => void;
  guests: number;
  onGuestsChange: (next: number) => void;
}

/** Crew, drop-off and party size: the choices that reprice the charter without moving its dates. */
export function CharterOptions({
  quote,
  crewType,
  crewOptions,
  onCrewChange,
  onCrewVariantChange,
  onDropOffChange,
  guests,
  onGuestsChange,
}: CharterOptionsProps) {
  const t = useTranslations("YachtDetail");
  const tCrew = useTranslations("Common.crewTypes");
  const money = useExactMoney();

  /*
   * A crew role the offer sells as several variants: a male or a female captain, a skipper by
   * the day or by the week. The quote has already priced one, the customer's pick or the
   * adapter's default, and says which in the line's detail; this offers the rest.
   */
  const offered = new Map((quote?.offeredExtras ?? []).map((item) => [item.code, item]));
  const crewVariants = (quote?.lines ?? []).flatMap((line) => {
    if (line.group !== "crew" || !isVariantCode(line.code)) return [];
    const variants = offered.get(baseExtraCode(line.code))?.variants ?? [];
    if (variants.length < 2) return [];
    const suffix = line.detail ? ` (${line.detail})` : "";
    const role =
      suffix && line.label.endsWith(suffix) ? line.label.slice(0, -suffix.length) : line.label;
    return [{ line, role, variants }];
  });

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

  const peoplePercent = ((guests - PEOPLE_MIN) / (PEOPLE_MAX - PEOPLE_MIN)) * 100;

  return (
    <>
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

      {onCrewVariantChange
        ? crewVariants.map(({ line, role, variants }) => (
            <div key={baseExtraCode(line.code)} className="flex flex-col gap-1.5">
              <span className="text-sm leading-4.25 font-semibold text-foreground">{role}</span>
              <Select
                className="h-12"
                options={variants.map((variant) => ({
                  value: variant.code,
                  label: `${variant.detail ?? role} - ${money(variant.amount.amountMinor, variant.amount.currency)}`,
                }))}
                value={line.code}
                onValueChange={(value) => {
                  if (value && value !== line.code) onCrewVariantChange(value);
                }}
              />
            </div>
          ))
        : null}

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
    </>
  );
}
