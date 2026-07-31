"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
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
import { ArrowRight, Calendar, ChevronDown, CircleCheckBig, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/* TODO: temporary until the backend defines the payment data shape. Flip to see the 100% variant
 * (Figma 967:70948) — banner copy, two schedule steps instead of three, Due Now and the CTA. */
const IS_PREPAYMENT_100 = false;

const CHARTER = {
  start: { date: "7 July, 2026", time: "17:00" },
  end: { date: "25 July, 2026", time: "22:00" },
  range: "7 July, 2026 - 25 July, 2026",
  boatPrice: "€10,000",
  deposit: "€2,000",
  total: "€12,500",
  perPerson: "€3,500",
  secondPaymentDate: "31.06.2026",
  checkInDate: "07.07.2026",
} as const;

const GROUPS = [
  {
    key: "mandatory",
    items: [
      { name: "Cleaning fee", price: "€150" },
      { name: "Service fee", price: "€150" },
      { name: "Expansive tanning platform", price: "€150" },
      { name: "Covered outdoor lounge", price: "€1,150" },
    ],
  },
  {
    key: "selectedExtras",
    items: [
      { name: "Outdoor dining area", price: "€150" },
      { name: "Helipad", price: "€150" },
      { name: "Outdoor speakers", price: "€150" },
      { name: "Covered outdoor lounge", price: "€1,150" },
    ],
  },
  {
    key: "crew",
    items: [
      { name: "Skipper", price: "€150" },
      { name: "Captain", price: "€150" },
      { name: "Cook", price: "€150" },
    ],
  },
] as const;

const CREW_OPTIONS = ["fullCrew", "skipperOptional"] as const;

const PEOPLE_MIN = 1;
const PEOPLE_MAX = 20;

function Separator() {
  return <span aria-hidden className="h-px w-full shrink-0 bg-border" />;
}

function CharterPoint({ point }: { point: { date: string; time: string } }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-base leading-5.5 font-bold whitespace-nowrap text-foreground">
        {point.date}
      </p>
      <p className="text-sm leading-4.5 font-medium text-natural-500">{point.time}</p>
    </div>
  );
}

function PriceGroup({ group }: { group: (typeof GROUPS)[number] }) {
  const t = useTranslations("YachtDetail");

  return (
    <Accordion defaultValue={[group.key]}>
      <AccordionItem value={group.key}>
        <AccordionTrigger
          className="h-7 px-4"
          indicator={
            <ChevronDown className="size-5 shrink-0 text-foreground transition-transform duration-200 group-data-panel-open:rotate-180" />
          }
        >
          <span className="text-xl text-foreground">{t(`sidebar.groups.${group.key}`)}</span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col pt-3">
            {group.items.map((item, index) => (
              <div key={item.name} className="flex flex-col">
                {index > 0 ? (
                  <span aria-hidden className="mt-3 mb-2.75 h-px w-full bg-border" />
                ) : null}
                <div className="flex items-start gap-2 px-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <p className="text-base leading-5.5 text-foreground">{item.name}</p>
                    <p className="text-xs font-semibold text-natural-500">
                      {t("extras.payAtCheckIn")}
                    </p>
                  </div>
                  <p className="shrink-0 text-base leading-5.5 font-bold text-foreground">
                    {item.price}
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

function PaymentSchedule() {
  const t = useTranslations("YachtDetail");
  const first = IS_PREPAYMENT_100 ? CHARTER.boatPrice : "€5,000";

  const steps = [
    { when: t("sidebar.payNow"), amount: t("sidebar.firstPayment", { amount: first }) },
    ...(IS_PREPAYMENT_100
      ? []
      : [
          {
            when: t("sidebar.payAt", { date: CHARTER.secondPaymentDate }),
            amount: t("sidebar.secondPayment", { amount: "€5,000" }),
            dated: true,
          },
        ]),
    {
      when: t("sidebar.payAtCheckIn", { date: CHARTER.checkInDate }),
      amount: t("sidebar.extrasPayment", { amount: "€1,200" }),
      note: t("sidebar.depositNote", { amount: CHARTER.deposit }),
      dated: true,
    },
  ];

  return (
    <div className="flex gap-3 px-4 py-4">
      <div className="relative flex w-4 shrink-0 justify-center">
        <span aria-hidden className="absolute inset-y-2 border-l-4 border-dotted border-border" />
        <span aria-hidden className="relative h-8 w-1 shrink-0 rounded-full bg-foreground" />
      </div>

      <ol className="flex min-w-0 flex-1 flex-col gap-12">
        {steps.map((step) => (
          <li key={step.amount} className="flex flex-col gap-1">
            <Chip className="gap-1 bg-transparent p-0 text-sm leading-4.5 font-medium text-natural-500">
              {"dated" in step ? <Calendar className="shrink-0" /> : null}
              {step.when}
            </Chip>
            <p className="text-base leading-5.5 font-bold text-foreground">{step.amount}</p>
            {"note" in step && step.note ? (
              <p className="text-sm leading-4.5 font-medium text-natural-500">{step.note}</p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function BookingSidebar() {
  const t = useTranslations("YachtDetail");
  const tCard = useTranslations("Common.boatCard");
  const [crew, setCrew] = useState<(typeof CREW_OPTIONS)[number]>(CREW_OPTIONS[0]);
  const [people, setPeople] = useState(5);

  const dueNow = IS_PREPAYMENT_100 ? CHARTER.boatPrice : "€5,000";
  const peoplePercent = ((people - PEOPLE_MIN) / (PEOPLE_MAX - PEOPLE_MIN)) * 100;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <ScrollArea className="min-h-0 flex-1 max-xl:[&_[data-slot=scroll-area-viewport]]:overscroll-auto">
        <div className="flex w-full flex-col gap-2 p-4 text-sm leading-4.5 font-medium text-foreground">
          <p>{tCard("stats.booked", { count: 3 })}</p>
          <p>{tCard("stats.viewed", { count: 42 })}</p>
        </div>

        <Separator />

        <div className="flex w-full flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <CharterPoint point={CHARTER.start} />
            <ArrowRight className="size-4 shrink-0 text-natural-300" />
            <CharterPoint point={CHARTER.end} />
          </div>

          <TextField
            readOnly
            value={CHARTER.range}
            startIcon={<Calendar />}
            fieldClassName="h-12"
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm leading-4.25 font-semibold text-foreground">
              {t("sidebar.crew")}
            </span>
            <Select
              value={crew}
              onValueChange={(value) => setCrew(value as (typeof CREW_OPTIONS)[number])}
            >
              <SelectTrigger className="h-12">
                <SelectValue>{() => tCard(`crews.${crew}`)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CREW_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {tCard(`crews.${option}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              value={people}
              onValueChange={(value) => setPeople(value as number)}
            />
            <div className="relative h-4.5">
              <span
                className="absolute -translate-x-1/2 text-sm font-medium text-foreground"
                style={{ left: `${peoplePercent}%` }}
              >
                {people}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 rounded-lg bg-brand-50 px-4 py-3">
            <CircleCheckBig className="size-4 shrink-0 text-brand" />
            <span className="text-sm leading-4.5 font-bold text-brand">
              {t("sidebar.prepayment", { percent: IS_PREPAYMENT_100 ? 100 : 50 })}
            </span>
          </div>

          <div className="flex gap-1.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-sm leading-4.5 font-medium text-natural-500">
                {t("sidebar.boatPrice")}
              </p>
              <p className="text-2xl leading-8 font-semibold text-foreground">
                {CHARTER.boatPrice}
              </p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-right">
              <p className="text-sm leading-4.5 font-medium text-natural-500">
                {t("sidebar.deposit")}
              </p>
              <p className="text-2xl leading-8 font-semibold text-foreground">{CHARTER.deposit}</p>
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
          </div>
        </div>

        <Separator />

        {GROUPS.map((group) => (
          <div key={group.key} className="flex w-full flex-col py-4">
            <PriceGroup group={group} />
          </div>
        ))}

        <PaymentSchedule />

        <Separator />

        <div className="flex w-full flex-col items-center gap-1 p-4">
          <p className="text-sm leading-4.5 font-medium text-natural-500">
            {t("sidebar.totalPrice")}
          </p>
          <p className="text-[32px] leading-9 font-bold text-foreground">{CHARTER.total}</p>
          <p className="text-sm leading-4.5 font-medium text-natural-500">
            {tCard("perPersonApprox", { price: CHARTER.perPerson })}
          </p>
        </div>

        <Separator />

        <div className="flex w-full flex-col gap-3 p-4">
          <div className="flex flex-col items-center gap-1">
            <p className="text-sm leading-4.5 font-medium text-natural-500">
              {t("sidebar.dueNow")}
            </p>
            <p className="text-[42px] leading-14 font-bold text-foreground">{dueNow}</p>
          </div>
          <Button variant="brand">{t("sidebar.payNowCta", { amount: dueNow })}</Button>
          <Button variant="neutral">{t("sidebar.requestQuote")}</Button>
        </div>
      </ScrollArea>
    </div>
  );
}
