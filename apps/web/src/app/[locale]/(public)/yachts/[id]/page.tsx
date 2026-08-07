import { ORPCError } from "@orpc/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { Hydrated } from "@/components/layout/hydrated";
import { YachtDetailScreen } from "@/features/yachts";
import { prefetchListingDetail } from "@/features/yachts/api/server";
import { buildMetadata } from "@/lib/seo";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}): Promise<Metadata> {
  const { id, locale } = await params;
  const t = await getTranslations("Seo.YachtDetail");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: `/yachts/${id}`,
    noIndex: true,
  });
}

export default async function YachtDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof prefetchListingDetail>>;
  try {
    detail = await prefetchListingDetail(id);
  } catch (error) {
    // listings.get throws NOT_FOUND for an unknown id/slug — that's a 404, not a 500.
    if (error instanceof ORPCError && error.code === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
  const { state, title } = detail;

  return (
    <Hydrated state={state}>
      <YachtDetailScreen title={title} />
    </Hydrated>
  );
}
