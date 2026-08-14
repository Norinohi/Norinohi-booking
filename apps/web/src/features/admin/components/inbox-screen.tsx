"use client";

import { Tabs, TabsList, TabsPanel, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { useTranslations } from "next-intl";
import { useState } from "react";

import Sidebar from "@/components/layout/sidebar";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";

import EnquiriesTable from "./enquiries-table";
import LeadsTable from "./leads-table";

/*
 * InboxScreen — /inbox: everything a customer wrote to us, in the same shell as Sync History.
 *
 * Two queues rather than one list, because they are answered differently: a booking question is
 * replied to in place and the customer is emailed, while a lead is someone to call. They share a
 * screen because staff should have one place to check, not two they must remember.
 */

const TABS = ["enquiries", "leads"] as const;

type Tab = (typeof TABS)[number];

export default function InboxScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Admin.Inbox");
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(TABS[0]);

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="px-4 py-6 md:px-13.5">
        <div className="mx-auto grid max-w-349 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[334px_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            variant="admin"
            defaultActive="inbox"
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

            <div className="flex flex-col gap-4 p-4 md:p-5">
              <Tabs
                variant="segmented"
                value={tab}
                onValueChange={(value) => setTab(TABS.find((id) => id === value) ?? TABS[0])}
              >
                <TabsList>
                  {TABS.map((id) => (
                    <TabsTab key={id} value={id} className="flex-1 py-3">
                      {t(`tabs.${id}`)}
                    </TabsTab>
                  ))}
                </TabsList>

                {/* Mounted per panel so the inactive queue is not fetched until it is opened. */}
                <TabsPanel value="enquiries">
                  {tab === "enquiries" ? <EnquiriesTable /> : null}
                </TabsPanel>
                <TabsPanel value="leads">{tab === "leads" ? <LeadsTable /> : null}</TabsPanel>
              </Tabs>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
