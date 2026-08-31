"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { useTranslations } from "next-intl";

import { useBooking } from "@/features/booking";
import { useExtraPrice } from "@/hooks/use-extra-price";
import { useMoney } from "@/hooks/use-money";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";

/*
 * The extras a visitor can add before entering the wizard. Ticking one reprices the sidebar's
 * quote through `selectExtras`, which debounces; the box itself answers immediately.
 *
 * Three states, because two different things can stop an extra being sold and the customer
 * deserves to know which. `selectable` is about the provider: it can never match an id space it
 * has not learned, so those are arranged with the base. `offeredExtras` is about the week: the
 * catalogue lists everything the operator sells across every season, and a given period prices
 * only part of it. Both used to render as ordinary checkboxes that quietly cost nothing.
 *
 * Nothing renders as a choice until the first quote lands. Every answer on this list — the
 * price, whether it is settled at the base, whether it can be bought at all — is the offer's,
 * and painting the catalogue's answers first would show prices that then move and checkboxes
 * that then disappear. A later reprice only skeletons the amounts, the way the sidebar does:
 * the rows themselves are still true, just not yet re-priced.
 *
 * Reaching into `@/features/booking` is the exception the architecture allows, through that
 * feature's public index: this list and the sidebar edit one quote, and the alternative is
 * threading a control slot down from the route through the whole screen.
 */
export default function OptionalExtrasSection() {
  const t = useTranslations("YachtDetail");
  const tBooking = useTranslations("Booking.extras");
  const { data } = useListingDetail();
  const { extras, selectExtras, quote, isPending } = useBooking();

  if (!data) return null;

  /* No quote yet and one on its way: the offer has not answered, so the list states the
     extras and holds its prices rather than guessing them from the catalogue. */
  if (quote === null && isPending) {
    return (
      <DetailSection id="optional-extras" title={t("sections.optionalExtras")}>
        <div className="flex flex-col">
          {data.optionalExtras.map((item) => (
            <div
              key={item.code}
              className="flex items-start gap-2 border-b border-dashed border-border pt-3 pb-2.75"
            >
              <span aria-hidden className="size-4 shrink-0" />
              <p className="min-w-0 flex-1 text-base leading-5.5 text-foreground">{item.label}</p>
              <Skeleton className="h-5.5 w-24 shrink-0" />
            </div>
          ))}
        </div>
      </DetailSection>
    );
  }

  /* Null until a quote exists, and for a provider whose offer does not report it —
     neither is grounds for greying anything out. */
  const offered = quote?.offeredExtras
    ? new Map(quote.offeredExtras.map((item) => [item.code, item]))
    : null;
  const isOffered = (code: string) => offered === null || offered.has(code);

  const sellable = data.optionalExtras.filter((item) => item.selectable && isOffered(item.code));
  const notOnTheseDates = data.optionalExtras.filter(
    (item) => item.selectable && !isOffered(item.code),
  );
  const arrangeAtBase = data.optionalExtras.filter((item) => !item.selectable);

  return (
    <DetailSection id="optional-extras" title={t("sections.optionalExtras")}>
      <div className="flex flex-col">
        {sellable.map((item) => (
          <label
            key={item.code}
            className="flex cursor-pointer items-start gap-2 border-b border-dashed border-border pt-3 pb-2.75"
          >
            <Checkbox
              checked={extras.includes(item.code)}
              onCheckedChange={(checked) =>
                selectExtras(
                  checked ? [...extras, item.code] : extras.filter((code) => code !== item.code),
                )
              }
            />
            <ExtraRow item={item} offered={offered?.get(item.code) ?? null} repricing={isPending} />
          </label>
        ))}

        {[
          { items: notOnTheseDates, note: tBooking("notOnTheseDates") },
          { items: arrangeAtBase, note: tBooking("arrangeAtBase") },
        ].map(({ items, note }) =>
          items.map((item) => (
            <div
              key={item.code}
              className="flex items-start gap-2 border-b border-dashed border-border pt-3 pb-2.75"
            >
              {/* Keeps the label column aligned with the checkbox rows above. */}
              <span aria-hidden className="size-4 shrink-0" />
              <ExtraRow item={item} offered={null} note={note} />
            </div>
          )),
        )}
      </div>
    </DetailSection>
  );
}

type OptionalExtra = NonNullable<
  ReturnType<typeof useListingDetail>["data"]
>["optionalExtras"][number];

type OfferedExtra = NonNullable<
  NonNullable<ReturnType<typeof useBooking>["quote"]>["offeredExtras"]
>[number];

/*
 * Price and unit, and which pair depends on what we know. `offered` is what the vendor will bill
 * for this charter — the only figure a tickable row may show, since the catalogue's own price is a
 * unit against a measure the operator chose and the offer multiplies it by a quantity it chose
 * too. A row with no offer falls back to that unit, stated with the measure it belongs to rather
 * than under a blanket "per booking" that reads €10 for a Tour the quote then charges €100 for.
 */
function ExtraRow({
  item,
  offered,
  note,
  repricing = false,
}: {
  item: OptionalExtra;
  offered: OfferedExtra | null;
  note?: string;
  repricing?: boolean;
}) {
  const tExtras = useTranslations("Common.extras");
  const money = useMoney();
  const extraPrice = useExtraPrice();
  /*
   * An extra the charter price already covers is collected nowhere and costs nothing, so it
   * carries neither caption nor figure: the offer prices it at zero, and the catalogue's own
   * list value would read as a charge the customer is not being asked for.
   */
  const included = item.pricingType === "included";
  /* Whether it is settled at the base is the offer's answer where there is one; the two
     sources disagree on individual extras, and the offer is what will be charged. */
  const atCheckIn = offered
    ? offered.payWhen === "at_check_in"
    : item.pricingType === "pay_at_check_in";
  const caption = note ?? (atCheckIn && !included ? tExtras("payAtCheckIn") : null);

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-base leading-5.5 text-foreground">{item.label}</p>
        {caption === null ? null : (
          <p className="text-xs font-semibold text-natural-300">{caption}</p>
        )}
      </div>
      {repricing ? (
        <Skeleton className="h-5.5 w-24 shrink-0" />
      ) : (
        <p className="shrink-0 text-base font-bold text-foreground">
          {included
            ? tExtras("includedInPrice")
            : offered
              ? money(offered.amount.amountMinor, offered.amount.currency)
              : extraPrice(item.price.amountMinor, item.priceMeasure, null, item.price.currency)}
        </p>
      )}
    </>
  );
}
