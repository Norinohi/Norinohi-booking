"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Tabs, TabsList, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import { Plus } from "lucide-react";
import type { Route } from "next";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import Sidebar from "@/components/layout/sidebar";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { authClient } from "@/lib/auth-client";

import type { Discount, YachtPrice } from "../lib/discounts";
import DiscountsTable from "./discounts-table";
import ManagePricesTable from "./manage-prices-table";

/*
 * DiscountManagerScreen — the /profile/discounts layout: a "← Home" breadcrumb, then the
 * admin Sidebar beside the "Discount & Price Manager" panel (stacked below lg). The panel is
 * a header (title + subtitle + Create Discount) over a Discounts | Manage Prices tab bar;
 * "Discounts" shows the promo-code table, "Manage Prices" the provider-listing price table.
 * The create/edit overlays live on their own routes (/create, /edit/[id], /prices/[id]) and
 * open through the @modal interception slot, so the URL — not local state — is what opens them.
 * Figma "Discount & Price Manager" (972:55055 desktop / 973:90636 tablet / 973:99174 mobile;
 * Manage Prices 972:55440 / 973:103838 / 973:103902).
 */

type ManagerTab = "discounts" | "manage-prices";

export default function DiscountManagerScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Discounts");
  const router = useRouter();
  const [tab, setTab] = useState<ManagerTab>("discounts");

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  const openCreate = () => router.push("/profile/discounts/create" as Route);
  /* `edit/[id]`, not `[id]/edit`: Next can't intercept a route whose first intercepted
     segment is dynamic — `(.)[id]` throws "Invalid interception route" at match time. */
  const openEdit = (discount: Discount) =>
    router.push(`/profile/discounts/edit/${discount.id}` as Route);
  const openPriceEdit = (yacht: YachtPrice) =>
    router.push(`/profile/discounts/prices/${yacht.id}` as Route);

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="px-4 py-6 md:px-13.5">
        {/* minmax(0,1fr) also below lg — otherwise the tables' min-width propagates through
            the single implicit column and stretches the page (and the fixed dialogs) on
            tablet/mobile. */}
        <div className="mx-auto grid max-w-349 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[334px_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            variant="admin"
            defaultActive="discount"
            onLogout={logout}
            className="max-w-none"
          />

          <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
            {/* Header — 20px padding, title 20/bold over 14 subtitle (8px apart), brand
                Create Discount (48px) centered on the right; hairline spans the card. */}
            {/* Mobile (973:97018): 16px side / 20px block padding, 18px title, 20px gap to a
                full-width button; from md the desktop band (20px padding, 20px title). */}
            <div className="flex flex-wrap items-center justify-between gap-5 border-b border-natural-50 px-4 py-5 md:gap-4 md:p-5">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg leading-[1.3] font-bold text-foreground md:text-xl">
                  {t("title")}
                </h2>
                <p className="text-sm leading-[1.3] font-medium text-natural-500">
                  {t("subtitle")}
                </p>
              </div>
              <Button variant="brand" onClick={openCreate} className="w-full sm:w-auto">
                <Plus />
                {t("create")}
              </Button>
            </div>

            {/* Tab bar + active tab's content share the 20px section padding, 16px apart. */}
            <div className="flex flex-col gap-4 p-5">
              <Tabs value={tab} onValueChange={(value) => setTab(value as ManagerTab)}>
                <TabsList>
                  <TabsTab value="discounts">{t("tabs.discounts")}</TabsTab>
                  <TabsTab value="manage-prices">{t("tabs.managePrices")}</TabsTab>
                </TabsList>
              </Tabs>
              {/* Both panels stay mounted and toggle via `hidden`: client-REMOUNTING a
                  horizontally-scrollable 960px table makes mobile emulation expand the
                  layout viewport to the page bounds (breaking every fixed overlay), while
                  an initial mount + display toggle is safe. Filter/pager state survives
                  tab switches as a side benefit. */}
              <div className={tab === "discounts" ? undefined : "hidden"}>
                <DiscountsTable onEdit={openEdit} />
              </div>
              <div className={tab === "manage-prices" ? undefined : "hidden"}>
                <ManagePricesTable onEdit={openPriceEdit} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
