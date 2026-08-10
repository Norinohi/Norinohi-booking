"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@yacht-charter/ui/components/form/form";
import { useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { useForm } from "react-hook-form";

import BoatCard from "@/components/shared/data-display/boat-card";
import SplitPanels from "@/components/shared/layout/split-panels";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { useBoatCards } from "@/hooks/use-boat-cards";
import { SAMPLE_BOATS } from "@/lib/sample-boats";

import { BOOKING_DEFAULTS, type BookingValues, useBookingSchema } from "../lib/booking-form";
import { bookingParsers } from "../lib/search-params";
import { BookingProvider } from "./booking-provider";
import BookingSidebar from "./booking-sidebar";
import BookingSteps from "./booking-steps";

/* TODO: the flow always books the first sample boat until listings carry a real id. */
const BOAT = SAMPLE_BOATS[0];
const BOAT_HREF = "/yachts/lagoon-42";

export default function BookingScreen() {
  const t = useTranslations("Booking");
  const { toSearchCard } = useBoatCards();
  const { id: _id, ...boat } = toSearchCard(BOAT);
  const [{ quoteId }] = useQueryStates(bookingParsers);

  /* onTouched: silent until the first blur, live on every change after it — so a field stops
   * being red the moment it turns valid, without shouting at someone still typing. */
  const form = useForm<BookingValues>({
    defaultValues: BOOKING_DEFAULTS,
    resolver: zodResolver(useBookingSchema()),
    mode: "onTouched",
  });

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs
        items={[]}
        backLabel="Booking.backToYacht"
        backValues={{ name: BOAT.name }}
        backHref={BOAT_HREF}
      />

      <div className="w-full px-4 py-6 md:px-13.5">
        <Form {...form}>
          <BookingProvider quoteId={quoteId}>
            <SplitPanels
              labels={{ main: t("panels.main"), aside: t("panels.aside") }}
              main={
                <>
                  <BoatCard {...boat} summary priority />
                  <BookingSteps />
                </>
              }
              aside={<BookingSidebar actions={false} shaded />}
            />
          </BookingProvider>
        </Form>
      </div>
    </div>
  );
}
