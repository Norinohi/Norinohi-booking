"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Select } from "@yacht-charter/ui/components/form/select";
import { Slider } from "@yacht-charter/ui/components/form/slider";
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
import { Link } from "@/i18n/navigation";

import { Image } from "@/components/shared/data-display/image";
import Loader from "@/components/shared/feedback/loader";
import { useMoney } from "@/hooks/use-money";
import { dayToDisplay } from "@/lib/date";

import type { Quote, QuoteLine } from "@/features/booking/api/queries";

export type CrewType = NonNullable<Quote["crewType"]>;
/** `priceMinor` is null when no seasonal price covers the period; the quote prices it on selection. */
export type WeekSlot = {
  checkIn: string;
  checkOut: string;
  priceMinor: number | null;
  /** False for a synthesized slot, or for one a live quote has since refused. */
  bookable: boolean;
};

/**
 * A listing can offer several durations from the same check-in day, so the period,
 * not the start date, is what identifies a slot in the picker.
 */
export function slotKey(slot: { checkIn: string; checkOut: string }) {
  return `${slot.checkIn}_${slot.checkOut}`;
}

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

export type BookingSummaryProps = {
  /** The live quote to render, or `null` before a valid selection has been priced. */
  quote: Quote | null;
  /** A quote/reprice request is in flight — the breakdown is dimmed under a loader. */
  loading?: boolean;
  stats?: { booked: number; viewed: number } | null;

  slots: readonly WeekSlot[];
  selectedSlot: { checkIn: string; checkOut: string } | undefined;
  onSlotChange: (key: string) => void;
  /** The provider refused the last pick — shown under the date control. */
  slotError?: boolean;
  crewType: CrewType | undefined;
  crewOptions: readonly CrewType[];
  onCrewChange: (next: CrewType) => void;
  guests: number;
  onGuestsChange: (next: number) => void;

  /**
   * The listing has no bookable slot at all. Locks the date picker and swaps the panel for an
   * enquiry prompt, so the flow never opens on a yacht that cannot be quoted.
   */
  unavailable?: boolean;
  /** The Pay Now / Request Quote pair. The booking flow has its own CTA, so it hides them. */
  actions?: boolean;
  /** Lifts the price groups onto the neutral background (Figma: booking flow only). */
  shaded?: boolean;
  /** Where Pay Now leads — set once a quote exists so the id can ride along. */
  payNowHref?: AppPathname;
  /** Opens the Request Quote enquiry dialog — supplied by the sidebar container (detail page only). */
  onRequestQuote?: () => void;
};

function Separator() {
  return <span aria-hidden className="h-px w-full shrink-0 bg-border" />;
}

function CharterPoint({ date }: { date: string }) {
  const format = useFormatter();
  return (
    <p className="text-base leading-5.5 font-bold whitespace-nowrap text-foreground">
      {format.dateTime(dayToDisplay(date), "dayShort")}
    </p>
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
                    {line.payWhen === "at_check_in" ? (
                      <p className="text-xs font-semibold text-natural-500">
                        {tExtras("payAtCheckIn")}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-base leading-5.5 font-bold text-foreground">
                    {money(line.amount.amountMinor)}
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
    const date = format.dateTime(dayToDisplay(entry.dueAt), "dayShort");
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
                amount: money(entry.amount.amountMinor),
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
  slots,
  selectedSlot,
  onSlotChange,
  slotError = false,
  crewType,
  crewOptions,
  onCrewChange,
  guests,
  onGuestsChange,
  unavailable = false,
  actions = true,
  shaded = false,
  payNowHref,
  onRequestQuote,
}: BookingSummaryProps) {
  const t = useTranslations("YachtDetail");
  const tCard = useTranslations("Common.boatCard");
  const tCrew = useTranslations("Common.crewTypes");
  const money = useMoney();
  const format = useFormatter();
  const slotDay = (date: string) =>
    format.dateTime(dayToDisplay(date), { day: "numeric", month: "short", timeZone: "UTC" });
  const slotLabel = (slot: WeekSlot) => {
    const period = `${slotDay(slot.checkIn)} – ${slotDay(slot.checkOut)}`;
    return slot.priceMinor === null ? period : `${period} · ${money(slot.priceMinor)}`;
  };

  const peoplePercent = ((guests - PEOPLE_MIN) / (PEOPLE_MAX - PEOPLE_MIN)) * 100;

  const base = quote?.lines.find((line) => line.kind === "base");
  const rawPct = quote
    ? quote.paymentPolicy.mode === "full"
      ? 100
      : quote.paymentPolicy.depositPct
    : 0;
  const prepaymentPercent = rawPct > 1 ? Math.round(rawPct) : Math.round(rawPct * 100);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <ScrollArea className="min-h-0 flex-1 max-xl:[&_[data-slot=scroll-area-viewport]]:overscroll-auto">
        {stats ? (
          <>
            <div className="flex w-full flex-col gap-2 p-4 text-sm leading-4.5 font-medium text-foreground">
              <p>{tCard("stats.booked", { count: stats.booked })}</p>
              <p>{tCard("stats.viewed", { count: stats.viewed })}</p>
            </div>
            <Separator />
          </>
        ) : null}

        <div className="flex w-full flex-col gap-3 p-4">
          {quote ? (
            <div className="flex items-center justify-between gap-2">
              <CharterPoint date={quote.checkIn} />
              <ArrowRight className="size-4 shrink-0 text-natural-300" />
              <CharterPoint date={quote.checkOut} />
            </div>
          ) : null}

          <Select
            className="h-12"
            options={slots.map((slot) => ({
              value: slotKey(slot),
              label: slotLabel(slot),
              disabled: !slot.bookable,
            }))}
            value={selectedSlot ? slotKey(selectedSlot) : ""}
            onValueChange={onSlotChange}
            disabled={unavailable}
            placeholder={t("sidebar.datesPlaceholder")}
            emptyLabel={t("sidebar.selectDates")}
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

          {quote ? (
            <>
              <div className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-50 px-4 py-3">
                <CircleCheckBig className="size-4 shrink-0 text-brand" />
                <span className="text-sm leading-4.5 font-bold text-brand">
                  {t("sidebar.prepayment", { percent: prepaymentPercent })}
                </span>
              </div>

              <div className="flex gap-1.5">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm leading-4.5 font-medium text-natural-500">
                    {t("sidebar.boatPrice")}
                  </p>
                  <p className="text-2xl leading-8 font-semibold text-foreground">
                    {money((base ?? quote.lines[0])?.amount.amountMinor ?? 0)}
                  </p>
                </div>
                {quote.securityDeposit ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-1 text-right">
                    <p className="text-sm leading-4.5 font-medium text-natural-500">
                      {t("sidebar.deposit")}
                    </p>
                    <p className="text-2xl leading-8 font-semibold text-foreground">
                      {money(quote.securityDeposit.amountMinor)}
                    </p>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <button
                            type="button"
                            className="flex cursor-pointer items-center justify-end gap-1 text-xs font-semibold text-brand underline decoration-dotted outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                          />
                        }
                      >
                        <Info className="size-4 shrink-0" />
                        {t("sidebar.howItWorks")}
                      </TooltipTrigger>
                      <TooltipContent>{tCard("prepaymentInfo")}</TooltipContent>
                    </Tooltip>
                  </div>
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
                    "flex w-full flex-col py-4",
                    shaded && "border-b border-border bg-natural-50",
                  )}
                >
                  <PriceGroup labelKey={labelKey} lines={lines} />
                </div>
              );
            })}

            {quote.paymentSchedule.length ? (
              <PaymentSchedule entries={quote.paymentSchedule} />
            ) : null}

            <Separator />

            <div className="flex w-full flex-col items-center gap-1 p-4">
              <p className="text-sm leading-4.5 font-medium text-natural-500">
                {t("sidebar.totalPrice")}
              </p>
              <p className="text-[32px] leading-9 font-bold text-foreground">
                {money(quote.total.amountMinor)}
              </p>
              {quote.perPerson ? (
                <p className="text-sm leading-4.5 font-medium text-natural-500">
                  {tCard("perPersonApprox", { price: money(quote.perPerson.amountMinor) })}
                </p>
              ) : null}
            </div>

            <Separator />

            <div className="flex w-full flex-col gap-3 p-4">
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm leading-4.5 font-medium text-natural-500">
                  {t("sidebar.dueNow")}
                </p>
                <p className="text-[42px] leading-14 font-bold text-foreground">
                  {money(quote.deposit.amountMinor)}
                </p>
              </div>
              {actions ? (
                <>
                  <Button
                    variant="brand"
                    disabled={!payNowHref}
                    nativeButton={payNowHref ? false : undefined}
                    render={payNowHref ? <Link href={payNowHref} /> : undefined}
                  >
                    {t("sidebar.payNowCta", { amount: money(quote.deposit.amountMinor) })}
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
            {loading && !unavailable ? (
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
