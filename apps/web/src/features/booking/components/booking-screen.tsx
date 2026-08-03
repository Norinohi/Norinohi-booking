"use client";

import { useTranslations } from "next-intl";

import BoatCard from "@/components/shared/data-display/boat-card";
import BookingSummary from "@/components/shared/data-display/booking-summary";
import SplitPanels from "@/components/shared/layout/split-panels";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { useBoatCards } from "@/hooks/use-boat-cards";
import { SAMPLE_BOATS } from "@/lib/sample-boats";

import BookingSteps from "./booking-steps";

/* TODO: the flow always books the first sample boat until listings carry a real id. */
const BOAT = SAMPLE_BOATS[0];
const BOAT_HREF = "/yachts/lagoon-42";

export default function BookingScreen() {
  const t = useTranslations("Booking");
  const { toSearchCard } = useBoatCards();
  const { id: _id, ...boat } = toSearchCard(BOAT);

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs
        items={[]}
        backLabel="Booking.backToYacht"
        backValues={{ name: BOAT.name }}
        backHref={BOAT_HREF}
      />

      <div className="w-full px-4 py-6 md:px-13.5">
        <SplitPanels
          labels={{ main: t("panels.main"), aside: t("panels.aside") }}
          main={
            <>
              <BoatCard {...boat} summary priority />
              <BookingSteps
                guestDetails={<Placeholder />}
                extras={<Placeholder />}
                reviewAndBook={<Placeholder />}
                payment={<Placeholder />}
              />
            </>
          }
          aside={<BookingSummary actions={false} shaded />}
        />
      </div>
    </div>
  );
}

/* TODO: replaced step by step as each screen arrives. */
function Placeholder() {
  const t = useTranslations("Booking");

  return <p className="text-base leading-[1.4] text-natural-500">{t("stepPlaceholder")}</p>;
}
