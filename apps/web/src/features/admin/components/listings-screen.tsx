"use client";

import { useTranslations } from "next-intl";

import Sidebar from "@/components/layout/sidebar";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

import ListingsTable from "./listings-table";
import PublishDraftsControls from "./publish-drafts-controls";

/*
 * ListingsScreen for /listings: the review-then-release loop for imported inventory, in the same
 * shell as Sync History. The bulk release sits above the table because it is the exception;
 * the table below is where a listing is actually read before it is let out to customers.
 */

export default function ListingsScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Admin.Listings");
  const router = useRouter();

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="px-4 py-6 md:px-13.5">
        <div className="mx-auto grid max-w-349 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[334px_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            variant="admin"
            defaultActive="listings"
            onLogout={logout}
            className="max-w-none"
          />

          <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
            <div className="flex flex-col gap-2 border-b border-natural-50 px-4 py-5 md:p-5">
              <h1 className="text-lg leading-[1.3] font-bold text-foreground md:text-xl">
                {t("title")}
              </h1>
              <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("subtitle")}</p>
            </div>

            <div className="border-b border-natural-50 p-4 md:p-5">
              <PublishDraftsControls />
            </div>

            <div className="p-4 md:p-5">
              <ListingsTable />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
