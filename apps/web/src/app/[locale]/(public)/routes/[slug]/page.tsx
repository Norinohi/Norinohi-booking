import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { findRouteBySlug } from "@/features/routes/api/server";
import { buildMetadata } from "@/lib/seo";
import { routeImage } from "@/utils/route-image";

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const route = await findRouteBySlug(slug, locale);
  if (!route) notFound();

  return buildMetadata({
    locale,
    title: route.title,
    description: route.description ?? route.placeLabel,
    path: `/routes/${route.slug}`,
    image: routeImage(route),
  });
}

/*
 * The panel beside the map renders this route's copy, itinerary included, into the HTML, which
 * is what gets indexed; this page adds the heading and turns an unknown slug into a 404 rather
 * than the full map with nothing open.
 */
export default async function RoutePage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  const route = await findRouteBySlug(slug, locale);
  if (!route) notFound();

  return <h1 className="sr-only">{route.title}</h1>;
}
