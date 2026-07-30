import AppBreadcrumbs, { type AppBreadcrumb } from "@/components/shared/app-breadcrumbs";

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
          </div>
        </div>
      </div>
    </div>
  );
}
