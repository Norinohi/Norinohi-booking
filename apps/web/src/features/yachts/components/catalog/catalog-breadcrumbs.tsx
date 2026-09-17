import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";

import type { CatalogCrumb } from "../../lib/catalog-page";

export interface CatalogBreadcrumbsProps {
  trail: CatalogCrumb[];
}

/**
 * The trail a catalogue page already declares in its `BreadcrumbList`, shown. Search engines were
 * the only readers of it, which left a visitor landing on a region page no way up to the country
 * but the browser's back button.
 */
export default function CatalogBreadcrumbs({ trail }: CatalogBreadcrumbsProps) {
  return (
    <AppBreadcrumbs
      items={[
        { name: "YachtDetail.breadcrumbSearch", url: "/yachts" },
        ...trail.map((crumb) => ({
          name: crumb.label,
          url: crumb.exists ? crumb.path : undefined,
          dynamic: true,
        })),
      ]}
    />
  );
}
