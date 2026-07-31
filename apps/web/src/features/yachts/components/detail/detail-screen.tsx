import AppBreadcrumbs, { type AppBreadcrumb } from "@/components/shared/app-breadcrumbs";

import AmenitiesSection from "./amenities-section";
import BookingSidebar from "./booking-sidebar";
import DescriptionSection from "./description-section";
import DetailPanels from "./detail-panels";
import DetailTabs from "./detail-tabs";
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
        <DetailPanels
          details={
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
          booking={<BookingSidebar />}
        />
      </div>
    </div>
  );
}
