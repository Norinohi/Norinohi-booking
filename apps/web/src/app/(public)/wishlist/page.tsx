import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

import Hydrated from "@/components/shared/layout/hydrated";
import { authClient } from "@/lib/auth-client";

import { WishlistScreen } from "@/features/wishlist";
import { prefetchWishlist } from "@/features/wishlist/api/server";

export async function generateMetadata() {
  const t = await getTranslations("Wishlist");
  return { title: t("title") };
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
