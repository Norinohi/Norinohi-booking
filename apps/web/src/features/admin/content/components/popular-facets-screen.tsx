"use client";

import { useTranslations } from "next-intl";

import Sidebar from "@/components/layout/sidebar";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

import PopularFacetsTable from "./popular-facets-table";

interface PopularFacetsScreenProps {
  user: { name: string; email: string };
}

/*
 * PopularFacetsScreen for /popular: which values head a filter's list and which lead the home
 * page. Same shell as FAQ and Routes; the table below is the whole screen.
 */
export default function PopularFacetsScreen({ user }: PopularFacetsScreenProps) {
  const t = useTranslations("Admin.Popular");
  const router = useRouter();

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="mx-auto w-full max-w-384 px-4 py-6 md:px-13.5 xl:px-17.5">
        <div className="mx-auto grid max-w-349 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[--spacing(83.5)_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            variant="admin"
            defaultActive="popular"
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

            <div className="p-4 md:p-5">
              <PopularFacetsTable />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
