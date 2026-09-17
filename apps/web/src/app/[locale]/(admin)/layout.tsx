import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { adminClientMessages } from "@/i18n/messages";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { requireRole } from "@/lib/auth/server";

/*
 * The (admin) group's role gate. Platform-staff screens used to live under /profile and each
 * repeated the session fetch and the cast-and-redirect; the group exists so the check happens
 * once, above every screen in it, and a new admin route inherits it by being filed here.
 * The API enforces the same rule again on every procedure; this only keeps the UI honest.
 */
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(...STAFF_ROLES);

  /* A nested provider replaces the root one's messages rather than merging, so this repeats the
     public namespaces alongside `Admin`. They are the same objects the root provider got, which
     React's serializer sends as references when both layouts render in one payload. */
  return (
    <NextIntlClientProvider messages={adminClientMessages(await getMessages())}>
      {children}
    </NextIntlClientProvider>
  );
}
