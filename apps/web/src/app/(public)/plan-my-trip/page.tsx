import type { Metadata } from "next";

import { PlannerScreen } from "@/features/plan-my-trip";

export const metadata: Metadata = {
  title: "Help me plan my trip",
};

export default function PlanMyTripPage() {
  return <PlannerScreen />;
}
