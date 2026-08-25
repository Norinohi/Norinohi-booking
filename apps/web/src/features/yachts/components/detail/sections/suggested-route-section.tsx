"use client";

import { useTranslations } from "next-intl";

import { useListingDetail } from "../../../hooks/use-listing-detail";
import DetailSection from "./detail-section";
import SuggestedRouteView from "./suggested-route-view";

export default function SuggestedRouteSection() {
  const t = useTranslations("YachtDetail");
  const { data } = useListingDetail();

  /*
   * No route, no section. Routes are hand-authored per charter base or sailing region, so most
   * listings have none - and the tab in `detail-tabs` is filtered on the same condition, because
   * a tab that scrolls to nothing looks broken.
   */
  const route = data?.suggestedRoute;
  if (!route) return null;

  return (
    <DetailSection id="suggested-route" title={t("sections.suggestedRoute")}>
      <SuggestedRouteView title={route.title} description={route.description} stops={route.stops} />
    </DetailSection>
  );
}
