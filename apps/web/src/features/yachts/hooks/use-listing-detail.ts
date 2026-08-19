"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { useParams } from "next/navigation";

import { listingDetailQueryOptions } from "../api/queries";

export function useListingDetail() {
  const { id } = useParams<{ id: string }>();
  const locale = useLocale();
  return useQuery(listingDetailQueryOptions(id, locale));
}
