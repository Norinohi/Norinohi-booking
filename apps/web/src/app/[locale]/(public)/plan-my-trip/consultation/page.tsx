import { Suspense } from "react";
import type { Metadata } from "next";

import { ConsultationScreen } from "@/features/plan-my-trip";
import { buildMetadata } from "@/lib/seo";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata({
    locale,
    title: "Get in touch",
    description: "Book a call or send us a message about your trip.",
    path: "/plan-my-trip/consultation",
    noIndex: true,
  });
}

export default function PlanMyTripConsultationPage() {
  // nuqs reads the query string, so the screen has to sit behind a boundary to prerender.
  // The real loading skeleton lands with the instant-navigation work.
  return (
    <Suspense fallback={null}>
      <ConsultationScreen />
    </Suspense>
  );
}
