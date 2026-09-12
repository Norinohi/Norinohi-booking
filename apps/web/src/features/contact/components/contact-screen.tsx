"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { env } from "@yacht-charter/env/web";
import { Check, Mail, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { CalendlyWidget } from "@/components/shared/data-display/calendly-widget";
import { LeadEnquiryForm } from "@/components/shared/form/lead-enquiry-form";

import { contactCalendlyUrl } from "../lib/calendly-url";

type Channel = "call" | "message";

/**
 * /contact — the same two-channel card as the planner's consultation step, with nothing
 * attached to it.
 *
 * The planner version opens on a trip it has already worked out, so it waits on a
 * recommendation and sends it along with the message. This page is reached cold, from the
 * filters panel or the footer, so both channels are live on first paint and the enquiry
 * carries only what the visitor types. `/support` remains the door for an existing booking.
 */
export default function ContactScreen() {
  const t = useTranslations("Contact");
  const calendlyUrl = env.NEXT_PUBLIC_CALENDLY_URL;
  const [channel, setChannel] = useState<Channel>(calendlyUrl ? "call" : "message");
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="flex flex-1 flex-col justify-center px-4 py-8 md:px-13.5 md:py-15 2xl:px-17.5">
      <div className="relative mx-auto flex w-full max-w-175 shrink-0 flex-col overflow-hidden rounded-3xl bg-card px-6 pt-10 pb-6 shadow-[4px_4px_15px_rgba(0,0,0,0.03)] md:px-10 md:pt-10 md:pb-10">
        <div className="flex flex-col gap-4 md:gap-8">
          <div className="flex flex-col gap-4 text-center">
            <h1 className="text-h4 text-foreground">{t("title")}</h1>
            <p className="text-body-xl text-natural-600">{t("subtitle")}</p>
          </div>

          <Tabs
            value={channel}
            onValueChange={(value) => setChannel(value === "message" ? "message" : "call")}
            className="gap-6"
          >
            <TabsList className="justify-center">
              <TabsTab value="call" className="flex items-center gap-2">
                <Phone className="size-4" />
                {t("options.call.title")}
              </TabsTab>
              <TabsTab value="message" className="flex items-center gap-2">
                <Mail className="size-4" />
                {t("options.message.title")}
              </TabsTab>
            </TabsList>

            {/* Kept mounted for the same reason as the planner's: remounting reloads Calendly's
                iframe, losing whatever day the visitor had already picked. */}
            <TabsPanel keepMounted value="call" className="flex flex-col items-center gap-4">
              <p className="text-center text-sm text-natural-600">
                {t("options.call.description")}
              </p>
              {calendlyUrl ? (
                <CalendlyWidget url={contactCalendlyUrl(calendlyUrl)} />
              ) : (
                <div className="flex w-full flex-col items-start gap-2 rounded-2xl bg-brand-50 p-6">
                  <p className="text-base font-semibold text-foreground">
                    {t("placeholder.title")}
                  </p>
                  <p className="text-sm text-natural-600">{t("placeholder.description")}</p>
                  <Button
                    variant="brand"
                    className="mt-2 w-full md:w-auto"
                    onClick={() => setChannel("message")}
                  >
                    {t("placeholder.cta")}
                  </Button>
                </div>
              )}
            </TabsPanel>

            <TabsPanel
              value="message"
              className="mx-auto flex w-full max-w-125 flex-col items-center gap-4"
            >
              <p className="text-center text-sm text-natural-600">
                {t("options.message.description")}
              </p>
              {submitted ? (
                <div className="flex flex-col items-center gap-3 rounded-2xl bg-brand-50 p-6 text-center">
                  <Check className="size-8 text-brand" />
                  <p className="text-base font-semibold text-foreground">{t("submitted.title")}</p>
                  <p className="text-sm text-natural-600">{t("submitted.description")}</p>
                </div>
              ) : (
                <LeadEnquiryForm
                  kind="charter_expert"
                  submitLabel={t("send")}
                  submitClassName="w-full"
                  successMessage={t("sent")}
                  onSuccess={() => setSubmitted(true)}
                />
              )}
            </TabsPanel>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
