import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

import { getAdminUser, isStaff } from "@/features/admin";

/*
 * The (admin) group's role gate. Platform-staff screens used to live under /profile and each
 * repeated the session fetch and the cast-and-redirect; the group exists so the check happens
 * once, above every screen in it, and a new admin route inherits it by being filed here.
 * The API enforces the same rule again on every procedure — this only keeps the UI honest.
 */
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const user = await getAdminUser();

  if (!user) {
    return redirect({ href: "/login", locale });
  }

  if (!isStaff(user)) {
    return redirect({ href: "/profile", locale });
  }

  return children;
}
