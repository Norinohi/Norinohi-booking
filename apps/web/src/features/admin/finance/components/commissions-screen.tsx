"use client";

import { Tabs, TabsList, TabsPanel, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { useTranslations } from "next-intl";
import { useState } from "react";

import Sidebar from "@/components/layout/sidebar";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";
import { SITE_NAME } from "@/lib/seo";

import AgreementRatesTable from "./agreement-rates-table";
import ReportedCommissionsTable from "./reported-commissions-table";

/*
 * CommissionsScreen - /commissions: what the marketplace earns through each vendor, from the
 * two sources that can answer it.
 *
 * "Reported" opens, because it is the one grounded in fact: both providers state a commission
 * on every offer they price, the availability sweep stores it, and the quote now ranks on it.
 * The typed agreements beside it predate that and are the fallback for an offer whose vendor
 * sent none - still worth keeping, no longer the only answer, and no longer the tab somebody
 * lands on when they want to know what a boat pays.
 */

const TABS = ["reported", "agreements"] as const;

type Tab = (typeof TABS)[number];

export default function CommissionsScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Admin.Commissions");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(TABS[0]);

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="px-4 py-6 md:px-13.5">
        <div className="mx-auto grid max-w-349 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[--spacing(83.5)_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            variant="admin"
            defaultActive="commission"
            onLogout={logout}
            className="max-w-none"
          />

          <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
            <div className="flex flex-col gap-2 border-b border-natural-50 px-4 py-5 md:p-5">
              <h1 className="text-lg leading-[1.3] font-bold text-foreground md:text-xl">
                {t("title")}
              </h1>
              <p className="text-sm leading-[1.3] font-medium text-natural-500">
                {t("subtitle", { brand: SITE_NAME })}
              </p>
            </div>

            <Tabs
              value={tab}
              onValueChange={(value) => setTab(TABS.find((id) => id === value) ?? TABS[0])}
              className="gap-0"
            >
              <TabsList className="px-4 md:px-5">
                {TABS.map((id) => (
                  <TabsTab key={id} value={id}>
                    {t(`tabs.${id}`)}
                  </TabsTab>
                ))}
              </TabsList>

              {/* Mounted per panel, so the tab nobody opened is not fetched. */}
              <TabsPanel value="reported">
                {tab === "reported" ? <ReportedCommissionsTable /> : null}
              </TabsPanel>
              <TabsPanel value="agreements">
                {tab === "agreements" ? <AgreementRatesTable /> : null}
              </TabsPanel>
            </Tabs>
          </section>
        </div>
      </div>
    </div>
  );
}
