"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { CircleCheckBig } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { useExtraPrice } from "@/hooks/use-extra-price";
import { useMoney } from "@/hooks/use-money";

import type { BookingValues } from "../../lib/booking-form";
import { useBooking } from "../booking-provider";

function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="py-2 text-xl leading-[1.3] font-bold text-foreground">{children}</h3>;
}

type OptionalExtra = NonNullable<
  ReturnType<typeof useBooking>["listing"]
>["optionalExtras"][number];

type OfferedExtra = NonNullable<
  NonNullable<ReturnType<typeof useBooking>["quote"]>["offeredExtras"]
>[number];

/*
 * The label, note and price shared by a selectable extra and one that is only shown.
 *
 * `offered` is what the vendor will bill for this charter, and the only figure a tickable row
 * may show: the catalogue's price is a unit against a measure the operator chose, which the
 * offer then multiplies by a quantity it chose too. Without an offer the unit is all there is,
 * so it is stated with its own measure rather than under a blanket "per booking".
 */
function ExtraRow({
  item,
  offered,
  note,
}: {
  item: OptionalExtra;
  offered?: OfferedExtra | undefined;
  note?: string;
}) {
  const tExtras = useTranslations("Common.extras");
  const money = useMoney();
  const extraPrice = useExtraPrice();
  /*
   * An extra the charter price already covers is collected nowhere and costs nothing, so it
   * carries neither caption nor figure: the offer prices it at zero, and the catalogue's own
   * list value would read as a charge the customer is not being asked for.
   */
  const included =
    item.percentage === null && (item.pricingType === "included" || item.price.amountMinor === 0);
  /* Whether it is settled at the base is the offer's answer where there is one; the two
     sources disagree on individual extras, and the offer is what will be charged. */
  const atCheckIn = offered
    ? offered.payWhen === "at_check_in"
    : item.pricingType === "pay_at_check_in";
  const caption = note ?? (atCheckIn && !included ? tExtras("payAtCheckIn") : null);

  return (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-base leading-[1.4] text-foreground">{item.label}</span>
        {caption === null ? null : (
          <span className="text-xs leading-[1.3] font-semibold text-natural-300">{caption}</span>
        )}
      </span>
      <span className="shrink-0 text-base leading-[1.4] font-bold text-foreground">
        {item.percentage !== null
          ? tExtras("percentageOfCharter", { percent: item.percentage * 100 })
          : included
            ? tExtras("includedInPrice")
            : offered
              ? money(offered.amount.amountMinor, offered.amount.currency)
              : extraPrice(item.price.amountMinor, item.priceMeasure, null, item.price.currency)}
      </span>
    </>
  );
}

export default function ExtrasStep() {
  const t = useTranslations("Booking.extras");
  const tExtras = useTranslations("Common.extras");
  const money = useMoney();
  const { control } = useFormContext<BookingValues>();
  const { listing, quote, selectExtras } = useBooking();

  /*
   * What the operator will bill on top of the charter, off the quote rather than off the
   * catalogue: this is the offer we are about to hold, so it is the list that will be charged.
   *
   * The section used to render `listing.includedAmenities` instead, so a step headed "Mandatory"
   * listed a radio, a teak deck and a TV, every one of them "Included" and none of them money.
   * Meanwhile the obligatory charges the same quote carries - EUR 1,307 of cleaning, skipper,
   * tourist tax and towels on one Lagoon 410 - appeared nowhere in checkout, which is how the
   * Review total came to exceed everything the customer had been shown. Equipment belongs in
   * Amenities on the yacht page, which already lists it.
   */
  const mandatory = (quote?.lines ?? []).filter((line) => line.group === "mandatory");
  const optional = listing?.optionalExtras ?? [];
  /* Null until a quote exists, and for a provider whose offer does not report it —
     neither is grounds for greying anything out. */
  const offered = quote?.offeredExtras
    ? new Map(quote.offeredExtras.map((item) => [item.code, item]))
    : null;
  const isOffered = (code: string) => offered === null || offered.has(code);
  const selectable = optional.filter((item) => item.selectable && isOffered(item.code));
  const notOnTheseDates = optional.filter((item) => item.selectable && !isOffered(item.code));
  const arrangeAtBase = optional.filter((item) => !item.selectable);

  return (
    <>
      {/* Absent entirely on a charter that carries none: a heading over nothing reads as a
          section that failed to load. */}
      {mandatory.length > 0 ? (
        <>
          <section className="flex flex-col p-5">
            <SectionTitle>{t("mandatory")}</SectionTitle>

            <ul className="flex flex-col">
              {mandatory.map((line) => (
                <li
                  key={line.code}
                  className="flex items-start gap-2 border-b border-dashed border-border py-3 last:border-b-0"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="text-base leading-[1.4] text-foreground">{line.label}</span>
                    {/* When it is collected, in the words the yacht page uses for the same
                        lines. A charge with no moment attached is the one a customer does not
                        expect to see on the card. */}
                    {line.amount.amountMinor === 0 ? null : (
                      <span className="text-xs leading-[1.3] font-semibold text-natural-300">
                        {line.payWhen === "at_check_in"
                          ? tExtras("payAtCheckIn")
                          : tExtras("dueWithPrepayment")}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 py-1">
                    {line.amount.amountMinor === 0 ? (
                      <>
                        <CircleCheckBig className="size-5 text-brand" />
                        <span className="text-base leading-[1.4] font-bold text-foreground">
                          {t("included")}
                        </span>
                      </>
                    ) : (
                      <span className="text-base leading-[1.4] font-bold text-foreground">
                        {money(line.amount.amountMinor, line.amount.currency)}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <span aria-hidden className="block h-px w-full bg-border" />
        </>
      ) : null}

      <section className="flex flex-col p-5">
        <SectionTitle>{t("optional")}</SectionTitle>

        <Controller
          control={control}
          name="extras.optional"
          render={({ field }) => (
            <div className="flex flex-col">
              {selectable.map((item) => (
                <label
                  key={item.code}
                  className="flex cursor-pointer items-start gap-2 border-b border-dashed border-border py-3"
                >
                  <Checkbox
                    checked={field.value.includes(item.code)}
                    onCheckedChange={(checked) => {
                      const next = checked
                        ? [...field.value, item.code]
                        : field.value.filter((code) => code !== item.code);
                      field.onChange(next);
                      /* The sidebar beside this step shows the same quote, so it moves with
                         the box rather than waiting for Continue to commit the step. */
                      selectExtras(next);
                    }}
                    onBlur={field.onBlur}
                  />
                  <ExtraRow item={item} offered={offered?.get(item.code)} />
                </label>
              ))}

              {/*
                Shown but not offered: a checkbox would take a choice and silently charge
                nothing for it. Two separate reasons, and the note says which — the provider
                cannot price this id space at all, or the operator did not put this extra on
                the offer for these dates. Either way the customer still needs to know the
                extra exists and roughly what it costs.
              */}
              {[
                { items: notOnTheseDates, note: t("notOnTheseDates") },
                { items: arrangeAtBase, note: t("arrangeAtBase") },
              ].map(({ items, note }) =>
                items.map((item) => (
                  <div
                    key={item.code}
                    className="flex items-start gap-2 border-b border-dashed border-border py-3"
                  >
                    {/* Keeps the label column aligned with the checkbox rows above. */}
                    <span aria-hidden className="size-4 shrink-0" />
                    <ExtraRow item={item} note={note} />
                  </div>
                )),
              )}
            </div>
          )}
        />
      </section>
    </>
  );
}
