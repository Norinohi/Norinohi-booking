"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Bookmark } from "lucide-react";
import { useTranslations } from "next-intl";

import { useWishlistToggle } from "../hooks/use-wishlist";

export type WishlistButtonProps = {
  /** Omit for cards rendering sample data — the button then stays visible but inert. */
  listingId?: string;
  variant?: "overlay" | "detail";
  className?: string;
};

export default function WishlistButton({
  listingId,
  variant = "overlay",
  className,
}: WishlistButtonProps) {
  const tCard = useTranslations("Common.boatCard");
  const tDetail = useTranslations("YachtDetail");
  const { saved, pending, disabled, toggle } = useWishlistToggle(listingId);

  /* Cards sit inside links and map-selectable regions, so the click must not bubble. */
  const onClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    /* The button stays keyboard-focusable while loading, so block a second toggle in flight. */
    if (pending) return;
    toggle();
  };

  if (variant === "detail") {
    return (
      <Button
        type="button"
        variant="brand"
        aria-pressed={saved}
        disabled={disabled}
        loading={pending}
        onClick={onClick}
        className={className}
      >
        <Bookmark className={cn(saved && "fill-current")} />
        {saved ? tDetail("removeFromWishlist") : tDetail("addToWishlist")}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="subtle"
      size="icon-md"
      aria-label={saved ? tCard("remove") : tCard("save")}
      aria-pressed={saved}
      disabled={disabled}
      loading={pending}
      onClick={onClick}
      className={cn(
        "shrink-0 bg-black/12 text-white hover:bg-black/25 hover:text-white focus-visible:ring-white/60",
        className,
      )}
    >
      <Bookmark className={cn(saved && "fill-current")} />
    </Button>
  );
}
