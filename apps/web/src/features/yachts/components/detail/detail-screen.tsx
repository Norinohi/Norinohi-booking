import AppBreadcrumbs, { type AppBreadcrumb } from "@/components/shared/app-breadcrumbs";

import AmenitiesSection from "./amenities-section";
import BookingSidebar from "./booking-sidebar";
import DescriptionSection from "./description-section";
import FaqSection from "./faq-section";
import Gallery from "./gallery";
import ImportantInfoSection from "./important-info-section";
import MandatoryExtrasSection from "./mandatory-extras-section";
import OptionalExtrasSection from "./optional-extras-section";
import OverviewSection from "./overview-section";
import PopularYachtsSection from "./popular-yachts-section";
import ReviewSection from "./review-section";
import SuggestedRouteSection from "./suggested-route-section";
import TitleBlock, { YACHT_NAME } from "./title-block";

const CRUMBS: AppBreadcrumb[] = [
  { name: "YachtDetail.breadcrumbSearch", url: "/yachts" },
  { name: YACHT_NAME, dynamic: true },
];

export default function YachtDetailScreen() {
  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={CRUMBS} backLabel="YachtDetail.backToSearch" backHref="/yachts" />

      <div className="w-full px-4 py-6 md:px-13.5">
        <div className="mx-auto grid w-full max-w-349 gap-5 xl:grid-cols-[minmax(0,1fr)_334px]">
          <div className="flex min-w-0 flex-col gap-6">
            <TitleBlock />
            <Gallery />
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
          </div>

          {/* The card is ~2050px against a ~900px viewport, so it is capped to the screen and
              scrolls internally — a plain sticky would pin it and leave the CTAs unreachable.
              The cap subtracts the header stack (nav + breadcrumb bar + page padding) on top of the
              sticky gap, so the card also fits before it pins at the very top of the page. */}
          <aside className="flex xl:sticky xl:top-6 xl:max-h-[calc(100dvh-12rem)] xl:self-start">
            <BookingSidebar />
          </aside>
        </div>
      </div>
    </div>
  );
}
