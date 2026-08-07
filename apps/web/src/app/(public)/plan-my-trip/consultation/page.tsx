import type { Metadata } from "next";

import { ConsultationScreen } from "@/features/plan-my-trip";
import { buildMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: "Get in touch",
    description: "Book a call or send us a message about your trip.",
    path: "/plan-my-trip/consultation",
    noIndex: true,
  });
}

export default function PlanMyTripConsultationPage() {
  return <ConsultationScreen />;
}
