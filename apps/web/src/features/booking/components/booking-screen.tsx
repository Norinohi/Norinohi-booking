"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@yacht-charter/ui/components/form/form";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryStates } from "nuqs";
import { useForm } from "react-hook-form";

import BoatCard from "@/components/shared/data-display/boat-card";
import SplitPanels from "@/components/shared/layout/split-panels";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { useListingCards, useListingDetail } from "@/features/yachts";
import type { AppPathname } from "@/i18n/navigation";

import { BOOKING_DEFAULTS, type BookingValues, useBookingSchema } from "../lib/booking-form";
import { bookingParsers } from "../lib/search-params";
import { BookingProvider } from "./booking-provider";
import BookingSidebar from "./booking-sidebar";
import BookingSteps from "./booking-steps";

export default function BookingScreen() {
  const t = useTranslations("Booking");
  const { id: slug } = useParams<{ id: string }>();
  const { data: listing } = useListingDetail();
  const { toCard } = useListingCards();
  const [{ quoteId }] = useQueryStates(bookingParsers);

  /* onTouched: silent until the first blur, live on every change after it — so a field stops
   * being red the moment it turns valid, without shouting at someone still typing. */
  const form = useForm<BookingValues>({
    defaultValues: BOOKING_DEFAULTS,
    resolver: zodResolver(useBookingSchema()),
    mode: "onTouched",
  });

  const boat = listing ? toCard(listing) : null;

  /* SAFETY: /yachts/[id] is a real route; typedRoutes only recognises it when the segment is a
     literal, and the slug is only known at request time. */
  const backHref = `/yachts/${slug}` as AppPathname;

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs
        items={[]}
        backLabel="Booking.backToYacht"
        backValues={{ name: listing?.title ?? "" }}
        backHref={backHref}
      />

      <div className="w-full px-4 py-6 md:px-13.5">
        <Form {...form}>
          <BookingProvider quoteId={quoteId}>
            <SplitPanels
              labels={{ main: t("panels.main"), aside: t("panels.aside") }}
              main={
                <>
                  {boat ? <BoatCard {...boat} summary priority /> : null}
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
