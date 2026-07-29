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
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import { authClient } from "@/lib/auth-client";

// Account control for the navigation bar — a bare User icon that opens an
// auth-aware menu. The theme switcher lives here too (the design has no
// standalone toggle), so light/dark control isn't lost.
export default function UserMenu() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <Skeleton className="size-10 rounded-full" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton variant="subtle" aria-label="Account" />}>
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
          <DropdownMenuItem onClick={() => router.push("/login")}>Sign In</DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => setTheme("light")}>Light</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("dark")}>Dark</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setTheme("system")}>System</DropdownMenuItem>
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
              Sign Out
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
