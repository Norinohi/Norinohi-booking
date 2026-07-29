import type { Metadata } from "next";

import { MapScreen } from "@/features/yachts";

export const metadata: Metadata = {
  title: "Yachts on the map",
};

export default function YachtsMapPage() {
  return <MapScreen />;
}
