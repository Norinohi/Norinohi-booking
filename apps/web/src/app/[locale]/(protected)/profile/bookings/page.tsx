import { headers } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { authClient } from "@/lib/auth-client";

import { BookingsScreen } from "@/features/profile";

export async function generateMetadata() {
  const t = await getTranslations("Bookings");
  return { title: t("title") };
}

export default async function BookingsPage() {
  const locale = await getLocale();
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    return redirect({ href: "/login", locale });
  }

  return <BookingsScreen user={{ name: session.user.name, email: session.user.email }} />;
}
