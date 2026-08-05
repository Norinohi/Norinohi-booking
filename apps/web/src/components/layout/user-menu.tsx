"use client";

import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@yacht-charter/ui/components/overlay/dropdown-menu";
import { User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

/*
 * UserMenu — Figma "Dropdowns" account menu (972:53920). A bare User icon opens a white
 * popover card (8px radius, natural-100 border, 4/4/10 drop shadow, 16/12 padding) listing
 * My Profile / My Bookings / Referrals / Credits & Balance and a red Log Out — SemiBold 14,
 * 8px row gaps. Signed-out visitors get a single Sign In item (the design covers only the
 * signed-in state). Referrals and Credits & Balance are rendered per the design but inert —
 * their pages don't exist yet.
 */

const ITEM =
  "w-full cursor-pointer rounded-none px-0 py-2 text-sm leading-[1.2] font-semibold tracking-[0.02em] text-foreground capitalize focus:bg-transparent focus:text-brand";

export default function UserMenu() {
  const t = useTranslations("Layout.UserMenu");
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="size-10 rounded-full" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton variant="subtle" aria-label={t("account")} />}>
        <User className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="flex w-[211px] flex-col gap-2 rounded-lg border border-natural-100 bg-card px-4 py-3 shadow-[4px_4px_10px_rgba(0,0,0,0.1)] ring-0"
      >
        {session ? (
          <>
            <DropdownMenuItem className={ITEM} onClick={() => router.push("/profile")}>
              {t("profile")}
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} onClick={() => router.push("/profile/bookings")}>
              {t("bookings")}
            </DropdownMenuItem>
            {/* TODO: navigate once the referrals / credits pages exist. */}
            <DropdownMenuItem className={ITEM}>{t("referrals")}</DropdownMenuItem>
            <DropdownMenuItem className={ITEM}>{t("credits")}</DropdownMenuItem>
            <DropdownMenuItem
              className={`${ITEM} text-error-500 focus:text-error-600`}
              onClick={() =>
                authClient.signOut({
                  fetchOptions: { onSuccess: () => router.push("/") },
                })
              }
            >
              {t("signOut")}
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem className={ITEM} onClick={() => router.push("/login")}>
            {t("signIn")}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
