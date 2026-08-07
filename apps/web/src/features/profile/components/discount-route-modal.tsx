"use client";

import { useRouter } from "next/navigation";

import type { Discount, YachtPrice } from "../lib/discounts";
import DiscountDialog from "./discount-dialog";
import PriceDialog from "./price-dialog";

/*
 * Route-driven wrappers for the Discount Manager overlays: the create/edit/price forms live
 * on their own routes (/profile/discounts/create, /[id]/edit, /prices/[id]). Soft navigation
 * from the list intercepts into the @modal slot — a centered dialog on md+ and the full-screen
 * takeover on mobile (Figma 972:55119 web / 973:99174 mobile) — while a hard load renders the
 * standalone page, which shows the same overlay and closes toward the list instead of back.
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
  discount = null,
  standalone = false,
}: {
  discount?: Discount | null;
  standalone?: boolean;
}) {
  const onOpenChange = useClose(standalone);
  return <DiscountDialog open onOpenChange={onOpenChange} discount={discount} />;
}

export function PriceRouteModal({
  yacht,
  standalone = false,
}: {
  yacht: YachtPrice;
  standalone?: boolean;
}) {
  const onOpenChange = useClose(standalone);
  return <PriceDialog open onOpenChange={onOpenChange} yacht={yacht} />;
}
