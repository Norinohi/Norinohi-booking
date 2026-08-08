import { useTranslations } from "next-intl";

import BookingSummary from "@/components/shared/data-display/booking-summary";
import SplitPanels from "@/components/shared/layout/split-panels";
import AppBreadcrumbs, { type AppBreadcrumb } from "@/components/shared/navigation/app-breadcrumbs";

import Gallery from "./gallery";
import AmenitiesSection from "./sections/amenities-section";
import DescriptionSection from "./sections/description-section";
import DetailTabs from "./sections/detail-tabs";
import FaqSection from "./sections/faq-section";
import ImportantInfoSection from "./sections/important-info-section";
import MandatoryExtrasSection from "./sections/mandatory-extras-section";
import OptionalExtrasSection from "./sections/optional-extras-section";
import OverviewSection from "./sections/overview-section";
import PopularYachtsSection from "./sections/popular-yachts-section";
import ReviewSection from "./sections/review-section";
import SuggestedRouteSection from "./sections/suggested-route-section";
import TitleBlock from "./title-block";

/* TODO: hardcoded booking route until listings carry a real id. */
const BOOKING_HREF = "/yachts/lagoon-42/booking";

/*
 * `title` is absent while the listing is still resolving — this screen is its own Suspense
 * fallback (see the route), so it must render without one. The frame, breadcrumb trail and panel
 * labels are identical either way; only the final crumb waits for the listing's name.
 */
export default function YachtDetailScreen({ title }: { title?: string }) {
  const t = useTranslations("YachtDetail");

  const breadcrumbs: AppBreadcrumb[] = [
    { name: "YachtDetail.breadcrumbSearch", url: "/yachts" },
    ...(title ? [{ name: title, dynamic: true } as AppBreadcrumb] : []),
  ];

  return (
    <div className="flex flex-col">
      {/* Static: no listing dependency, so it prerenders and anchors the shell. */}
      <div data-testid="yacht-detail-shell-marker">
        <AppBreadcrumbs
          items={breadcrumbs}
          backLabel="YachtDetail.backToSearch"
          backHref="/yachts"
        />
      </div>

      <div className="w-full px-4 py-6 md:px-13.5">
        <SplitPanels
          labels={{ main: t("panels.details"), aside: t("panels.booking") }}
          main={
            <>
              <TitleBlock />
              <Gallery />
              <DetailTabs />
              <OverviewSection />
              <AmenitiesSection />
              <MandatoryExtrasSection />
              <OptionalExtrasSection />
              <DescriptionSection />
              <ImportantInfoSection />
              <SuggestedRouteSection />
              <ReviewSection />
              <FaqSection />
              <PopularYachtsSection />
            </>
          }
          aside={<BookingSummary bookingHref={BOOKING_HREF} />}
        />
      </div>
    </div>
  );
}
