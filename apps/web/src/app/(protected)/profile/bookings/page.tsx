import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { authClient } from "@/lib/auth-client";

import { BookingsScreen } from "@/features/profile";

export async function generateMetadata() {
  const t = await getTranslations("Bookings");
  return { title: t("title") };
}

export default async function BookingsPage() {
  const session = await authClient.getSession({
    fetchOptions: {
      headers: await headers(),
      throw: true,
    },
  });

  if (!session?.user) {
    redirect("/login");
  }

  return <BookingsScreen user={{ name: session.user.name, email: session.user.email }} />;
}
