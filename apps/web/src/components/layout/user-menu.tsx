"use client";

import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@yacht-charter/ui/components/overlay/dropdown-menu";
import { User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

import { authClient, isStaffRole, userRole } from "@/lib/auth-client";
import { ACCOUNT_NAV_HREFS, ADMIN_NAV, type AccountNavItem } from "./account-nav";

/*
 * UserMenu — Figma "Dropdowns" account menu (972:53920). A bare User icon opens a white
 * popover card (8px radius, natural-100 border, 4/4/10 drop shadow, 16/12 padding) listing
 * My Profile / My Bookings / Referrals / Credits & Balance and a red Log Out — SemiBold 14,
 * 8px row gaps. Signed-out visitors get a single Sign In item (the design covers only the
 * signed-in state). Credits & Balance is rendered per the design but inert — its page
 * doesn't exist yet. Staff sessions also get every admin row the sidebar shows, so the menu is
 * a complete way in — the rows come from the same list the sidebar reads, and their labels from
 * the Sidebar namespace rather than being restated, nesting where the sidebar nests. A rule
 * separates them: the admin rows appended to the account four would otherwise read as one
 * undifferentiated list.
 */

const ITEM =
  "w-full cursor-pointer rounded-none px-0 py-2 text-sm leading-[1.2] font-semibold tracking-[0.02em] text-foreground capitalize focus:bg-transparent focus:text-brand";

/* The submenu wears the same card as the menu it grew out of, so a nested list reads as the
   same surface one step across rather than a differently-styled popover. */
const PANEL =
  "flex w-[211px] flex-col gap-2 rounded-lg border border-natural-100 bg-card px-4 py-3 shadow-[4px_4px_10px_rgba(0,0,0,0.1)] ring-0";

/* Admin rows whose page doesn't exist yet have no href and are simply left out here — the
   dropdown has no inert-row treatment, and a menu entry that goes nowhere is worse than absent. */
function AdminItem({ item, label }: { item: AccountNavItem; label: string }) {
  const router = useRouter();
  const href = ACCOUNT_NAV_HREFS.get(item);

  return href ? (
    <DropdownMenuItem className={ITEM} onClick={() => router.push(href)}>
      {label}
    </DropdownMenuItem>
  ) : null;
}

export default function UserMenu() {
  const t = useTranslations("Layout.UserMenu");
  const tAdmin = useTranslations("Layout.Sidebar");
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const isStaff = isStaffRole(userRole(session?.user));

  /* The trigger is the same icon signed in or out, so it must not wait on the session:
   * SSR renders with isPending true while the client resolves it from the cookie cache
   * before hydrating, and swapping a skeleton for the button across that boundary is a
   * hydration mismatch. Only the items below, which never render until the menu opens,
   * depend on the session. */
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton variant="subtle" aria-label={t("account")} />}>
        <User className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className={PANEL}>
        {isPending ? (
          <Skeleton className="h-8 w-full" />
        ) : session ? (
          <>
            <DropdownMenuItem className={ITEM} onClick={() => router.push("/profile")}>
              {t("profile")}
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} onClick={() => router.push("/profile/bookings")}>
              {t("bookings")}
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} onClick={() => router.push("/profile/referrals")}>
              {t("referrals")}
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} onClick={() => router.push("/profile/credits")}>
              {t("credits")}
            </DropdownMenuItem>
            {isStaff ? (
              <>
                <DropdownMenuSeparator className="mx-0 my-0 bg-natural-100" />
                {ADMIN_NAV.map((entry) =>
                  entry.kind === "group" ? (
                    <DropdownMenuSub key={entry.group}>
                      <DropdownMenuSubTrigger className={ITEM}>
                        {tAdmin(`groups.${entry.group}`)}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className={PANEL}>
                        {entry.items.map((item) => (
                          <AdminItem key={item} item={item} label={tAdmin(item)} />
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  ) : (
                    <AdminItem key={entry.item} item={entry.item} label={tAdmin(entry.item)} />
                  ),
                )}
              </>
            ) : null}
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
