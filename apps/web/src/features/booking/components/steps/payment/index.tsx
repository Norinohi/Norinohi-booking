"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { type Path, useFormContext, useWatch } from "react-hook-form";

import type { BookingValues } from "../../../lib/booking-form";
import { serializeConfirmation } from "../../../lib/search-params";
import AskQuestion from "./ask-question";
import PayByCard from "./pay-by-card";
import RequestInvoice from "./request-invoice";

/* TODO: flat mock price until the quote endpoint (M5) lands. */
const AMOUNT = "€5,000";

type PaymentMethod = BookingValues["payment"]["method"];
const TABS: PaymentMethod[] = ["card", "invoice", "question"];

export default function PaymentStep() {
  const t = useTranslations("Booking.payment");
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { control, trigger, getValues, setValue } = useFormContext<BookingValues>();
  const method = useWatch({ control, name: "payment.method" });

  const cta = {
    card: t("card.cta", { amount: AMOUNT }),
    invoice: t("invoice.cta", { amount: AMOUNT }),
    question: t("question.cta"),
  }[method];

  async function submit() {
    if (method !== "card" && !(await trigger("payment"))) {
      for (const field of Object.keys(getValues(`payment.${method}`))) {
        const path = `payment.${method}.${field}` as Path<BookingValues>;
        setValue(path, getValues(path), { shouldTouch: true });
      }
      return;
    }
    router.push(
      serializeConfirmation(`/yachts/${params.id}/booking/confirmation`, { method }) as Route,
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="py-2 text-xl leading-[1.3] font-bold text-foreground">{t("heading")}</h3>

        <Tabs
          variant="segmented"
          value={method}
          onValueChange={(value) => setValue("payment.method", value as PaymentMethod)}
        >
          <TabsList className="max-md:flex-col max-md:items-stretch">
            {TABS.map((id) => (
              <TabsTab key={id} value={id} className="flex-1 max-md:flex-none">
                {t(`tabs.${id}`)}
              </TabsTab>
            ))}
          </TabsList>

          <TabsPanel value="card">
            <PayByCard />
          </TabsPanel>
          <TabsPanel value="invoice">
            <RequestInvoice />
          </TabsPanel>
          <TabsPanel value="question">
            <AskQuestion />
          </TabsPanel>
        </Tabs>
      </div>

      <span aria-hidden className="block h-px w-full bg-border" />

      <div className="p-5">
        <Button variant="brand" className="h-13 w-full" onClick={() => void submit()}>
          {cta}
        </Button>
      </div>
    </>
  );
}
