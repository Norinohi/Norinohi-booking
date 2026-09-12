import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import SplitPanels from "@/components/shared/layout/split-panels";
import AppBreadcrumbs, { type AppBreadcrumb } from "@/components/shared/navigation/app-breadcrumbs";

import Gallery from "./gallery";
import SearchReturnLink from "./search-return-link";
import RecordView from "./record-view";
import AmenitiesSection from "./sections/amenities-section";
import DescriptionSection from "./sections/description-section";
import MediaLinksSection from "./sections/media-links-section";
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

/*
 * `title` is absent while the listing is still resolving — this screen is its own Suspense
 * fallback (see the route), so it must render without one. The frame, breadcrumb trail and panel
 * labels are identical either way; only the final crumb waits for the listing's name.
 *
 * `aside` is the booking sidebar, injected by the route: it belongs to the booking feature, so the
 * cross-feature composition happens in `app/**`, not here. `optionalExtras` is the same story for
 * the add-ons list — its ticked state lives on the booking quote, so the route wires it up and
 * hands the finished section in; left out, the plain read-only list renders.
 */
export default function YachtDetailScreen({
  title,
  description,
  aside,
}: {
  title?: string;
  /* Built on the server so the body, the head and the Product node say the same thing. */
  description?: string;
  aside?: ReactNode;
}) {
  const t = useTranslations("YachtDetail");

  /*
   * Both ways back lead to the search the visitor actually ran, filters included, which only the
   * browser knows: this page's URL carries the dates and nothing else. See `lib/last-search.ts`.
   */
  const breadcrumbs: AppBreadcrumb[] = [
    { name: "YachtDetail.breadcrumbSearch", render: <SearchReturnLink /> },
  ];
  if (title) breadcrumbs.push({ name: title, dynamic: true });

  return (
    <div className="flex flex-col">
      <RecordView />
      {/* Static: no listing dependency, so it prerenders and anchors the shell. */}
      <div data-testid="yacht-detail-shell-marker">
        <AppBreadcrumbs
          items={breadcrumbs}
          backLabel="YachtDetail.backToSearch"
          backHref="/yachts"
          backRender={<SearchReturnLink />}
        />
      </div>

      <div className="mx-auto w-full max-w-384 px-4 py-6 md:px-13.5 xl:px-17.5">
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
              <DescriptionSection description={description} />
              <MediaLinksSection />
              <ImportantInfoSection />
              <SuggestedRouteSection />
              <ReviewSection />
              <FaqSection />
              <PopularYachtsSection />
            </>
          }
          aside={aside}
        />
      </div>
    </div>
  );
}
