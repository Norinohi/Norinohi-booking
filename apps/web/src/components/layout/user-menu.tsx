"use client";

import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@yacht-charter/ui/components/overlay/dropdown-menu";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import { authClient } from "@/lib/auth-client";

// Account control for the navigation bar — a bare User icon that opens an
// auth-aware menu. The theme switcher lives here too (the design has no
// standalone toggle), so light/dark control isn't lost.
export default function UserMenu() {
  const t = useTranslations("Layout.UserMenu");
  const router = useRouter();
  const { setTheme } = useTheme();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="size-10 rounded-full" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton variant="subtle" aria-label={t("account")} />}>
        <User className="size-6" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-card">
        {session ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{session.user.name}</DropdownMenuLabel>
            <DropdownMenuItem className="text-muted-foreground">
              {session.user.email}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuItem onClick={() => router.push("/login")}>{t("signIn")}</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setTheme("light")}>{t("light")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>{t("dark")}</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>{t("system")}</DropdownMenuItem>
        </DropdownMenuGroup>
        {session && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() =>
                authClient.signOut({
                  fetchOptions: { onSuccess: () => router.push("/") },
                })
              }
            >
              {t("signOut")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
