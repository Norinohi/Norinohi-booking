import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { authClient } from "@/lib/auth-client";
import { buildMetadata } from "@/lib/seo";

import { WishlistScreen } from "@/features/wishlist";
import { prefetchWishlist } from "@/features/wishlist/api/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations("Seo.Wishlist");
  return buildMetadata({
    locale,
    title: t("title"),
    description: t("description"),
    path: "/wishlist",
    // Renders per visitor, so a crawler only ever sees the empty state.
    noIndex: true,
  });
}

export default async function WishlistPage() {
  /* Public route: the session only decides whether there is anything to prefetch, and
   * `throw: true` rejects for a visitor with no cookie. Either way, guests get the screen. */
  const session = await authClient
    .getSession({ fetchOptions: { headers: await headers(), throw: true } })
    .catch(() => null);

  if (!session?.user) {
    return <WishlistScreen />;
  }

  return (
    <Hydrated prefetch={prefetchWishlist}>
      <WishlistScreen />
    </Hydrated>
  );
}
