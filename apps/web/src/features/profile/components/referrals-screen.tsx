"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import Sidebar from "@/components/layout/sidebar";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { authClient } from "@/lib/auth-client";

import ReferralsHistory from "./referrals-history";
import ReferralsHowItWorks from "./referrals-how-it-works";
import ReferralsInvite from "./referrals-invite";

/*
 * ReferralsScreen — the /profile/referrals layout: a "← Home" breadcrumb, then the account
 * Sidebar beside the "Your Referrals" panel (stacked below lg, per the Figma tablet/mobile
 * frames). The panel is a titled header over three separator-split sections: the invite hero,
 * "How It Works" + "Your Level", and the referral history table.
 * Figma "My Referrals" (972:54801 desktop / 973:88651 tablet / 973:88718 mobile).
 */
export default function ReferralsScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Referrals");
  const router = useRouter();

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="px-4 py-6 md:px-13.5">
        <div className="mx-auto grid max-w-349 gap-5 lg:grid-cols-[334px_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            defaultActive="referrals"
            onLogout={logout}
            className="max-w-none"
          />

          <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
            {/* Title — 16px padding on mobile, 20px from md (Figma 973:88718 vs 972:54801) */}
            <div className="border-b border-natural-100 p-4 md:p-5">
              <h2 className="text-xl leading-[1.3] font-bold text-foreground">{t("title")}</h2>
            </div>

            <div className="p-4 md:p-5">
              <ReferralsInvite />
            </div>

            <div className="border-t border-natural-100 p-4 md:p-5">
              <ReferralsHowItWorks />
            </div>

            <div className="border-t border-natural-100 p-4 md:p-5">
              <ReferralsHistory />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
