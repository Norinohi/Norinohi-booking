import type { useListingDetail } from "@/features/yachts";

import type { Quote } from "./api/queries";

export type CrewType = NonNullable<Quote["crewType"]>;

export type ListingDetail = ReturnType<typeof useListingDetail>["data"];
