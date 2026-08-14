"use client";

import { Tabs, TabsList, TabsPanel, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { useTranslations } from "next-intl";
import { useState } from "react";

import Sidebar from "@/components/layout/sidebar";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";

import InvoiceRequestsTable from "./invoice-requests-table";
import RefundQueueTable from "./refund-queue-table";

/*
 * PaymentsScreen — /payments: the money that needs a human, in the same shell as the Inbox.
 *
 * Two queues rather than one, because they are opposite halves of the same problem: an invoice
 * request is money that has not arrived and is holding a yacht, a refund is money that has to
 * go back. They share a screen because both are settled by the same person doing the same daily
 * pass, and neither is visible anywhere else in the app.
 */

const TABS = ["invoices", "refunds"] as const;

type Tab = (typeof TABS)[number];

export default function PaymentsScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Admin.Payments");
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
            defaultActive="payments"
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

              {/* Mounted per panel so the queue nobody opened is not fetched. */}
              <TabsPanel value="invoices" className="p-4 md:p-5">
                {tab === "invoices" ? <InvoiceRequestsTable /> : null}
              </TabsPanel>
              <TabsPanel value="refunds" className="p-4 md:p-5">
                {tab === "refunds" ? <RefundQueueTable /> : null}
              </TabsPanel>
            </Tabs>
          </section>
        </div>
      </div>
    </div>
  );
}
