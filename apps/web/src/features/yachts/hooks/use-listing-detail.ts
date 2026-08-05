"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { listingDetailQueryOptions } from "../api/queries";

export function useListingDetail() {
  const { id } = useParams<{ id: string }>();
  return useQuery(listingDetailQueryOptions(id));
}
