import { BoatSmallCard } from "@yacht-charter/ui/components/data-display/card-boat-small";

import { WishlistButton } from "@/features/wishlist";
import { Link } from "@/i18n/navigation";

import { Image } from "../image";
import type { YachtTileData } from "./types";

export interface TileLayoutProps extends YachtTileData {
  className?: string;
}

/**
 * The carousel tile. The frame is `BoatSmallCard` from `packages/ui`, the Figma primitive; this
 * layout supplies what the package cannot reach: the CDN image, the localised link and the wishlist.
 */
export default function TileLayout({
  id,
  image,
  imageAlt,
  imageSizes,
  location,
  name,
  detailHref,
  rating,
  tags,
  price,
  listPrice,
  priceLabel,
  priceSuffix,
  actionLabel,
  className,
}: TileLayoutProps) {
  return (
    <BoatSmallCard
      className={className}
      imageRender={
        <Image src={image} alt={imageAlt} fill sizes={imageSizes} className="object-cover" />
      }
      location={location}
      title={
        <Link
          href={detailHref}
          className="rounded-sm outline-none transition-colors hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {name}
        </Link>
      }
      rating={rating}
      tags={tags}
      price={price}
      listPrice={listPrice}
      priceSuffix={priceSuffix}
      priceLabel={priceLabel}
      actionLabel={actionLabel}
      actionRender={<Link href={detailHref} />}
      saveRender={<WishlistButton listingId={id} />}
    />
  );
}
