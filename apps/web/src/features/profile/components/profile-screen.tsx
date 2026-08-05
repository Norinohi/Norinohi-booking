"use client";

import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import Sidebar from "@/components/layout/sidebar";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { authClient } from "@/lib/auth-client";

import { useProfile } from "../hooks/use-profile";
import ProfileForm from "./profile-form";

/*
 * ProfileScreen — the /profile layout: an optional "Profile Updated Successfully" flash banner,
 * a "← Home" breadcrumb, then the account Sidebar beside the profile form (stacked below the lg
 * breakpoint, per the Figma tablet/mobile frames). The banner is raised here (not in the form)
 * so it spans the full page width above the breadcrumb, as designed. Profile data comes from
 * the profile.get query, server-prefetched by the route.
 */
export default function ProfileScreen() {
  const t = useTranslations("Profile");
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  const { data: profile } = useProfile();

  const queryClient = useQueryClient();

  const logout = () =>
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          // Drop cached personal data before handing the browser to a signed-out state.
          queryClient.clear();
          router.push("/");
        },
      },
    });

  // The route prefetches profile.get, so this only guards the type (and a failed refetch).
  if (!profile) return null;

  return (
    <div className="flex flex-col">
      {saved ? (
        <div role="status" className="w-full bg-brand-50">
          <div className="flex items-center justify-center gap-2 px-4 py-3">
            <p className="text-base font-medium text-brand">{t("saved")}</p>
            <button
              type="button"
              onClick={() => setSaved(false)}
              aria-label={t("dismiss")}
              className="flex shrink-0 cursor-pointer items-center text-brand outline-none transition-opacity hover:opacity-70 focus-visible:opacity-70"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
      ) : null}

      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="px-4 py-6 md:px-13.5">
        <div className="mx-auto grid max-w-349 gap-5 lg:grid-cols-[334px_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={profile.name ?? profile.email}
            defaultActive="profile"
            onLogout={logout}
            className="max-w-none"
          />
          <ProfileForm profile={profile} onSaved={() => setSaved(true)} />
        </div>
      </div>
    </div>
  );
}
