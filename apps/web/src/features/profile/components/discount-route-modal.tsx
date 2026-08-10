"use client";

import { useRouter } from "@/i18n/navigation";

import DiscountDialog from "./discount-dialog";
import PriceDialog from "./price-dialog";

/*
 * Route-driven wrappers for the Discount Manager overlays: the create/edit/price forms live
 * on their own routes (/profile/discounts/create, /edit/[id], /prices/[id]). Soft navigation
 * from the list intercepts into the @modal slot — a centered dialog on md+ and the page-like
 * takeover on mobile (Figma 972:55119 web / 973:99981 mobile) — while a hard load renders the
 * standalone page, which shows the same overlay and closes toward the list instead of back.
 * The dialogs fetch their row by id (server-prefetched by the standalone pages), so both
 * entry paths share one data source.
 */

function useClose(standalone: boolean) {
  const router = useRouter();
  return (open: boolean) => {
    if (open) return;
    if (standalone) {
      router.push("/profile/discounts");
    } else {
      router.back();
    }
  };
}

export function DiscountRouteModal({
  discountId = null,
  standalone = false,
}: {
  discountId?: string | null;
  standalone?: boolean;
}) {
  const onOpenChange = useClose(standalone);
  return <DiscountDialog open onOpenChange={onOpenChange} discountId={discountId} />;
}

export function PriceRouteModal({
  listingId,
  standalone = false,
}: {
  listingId: string;
  standalone?: boolean;
}) {
  const onOpenChange = useClose(standalone);
  return <PriceDialog open onOpenChange={onOpenChange} listingId={listingId} />;
}
