import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardMedia,
  CardTitle,
} from "@yacht-charter/ui/components/data-display/card";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Bookmark, Star } from "lucide-react";

/*
 * BoatSmallCard — Figma "card/boat-small" (613:7587). Framed listing card: photo (+ save
 * bookmark), location, title + rating, tag chips, and a price / "View Details" footer.
 * One photo only — the card stays presentational, and the carousels that scroll between cards
 * live in the sections that use them.
 */
type BoatSmallCardProps = Omit<React.ComponentProps<"div">, "title"> & {
  image: string;
  imageAlt?: string;
  location?: React.ReactNode;
  title: React.ReactNode;
  rating?: number;
  tags?: { label: string; icon?: React.ReactNode }[];
  price: React.ReactNode;
  priceSuffix?: React.ReactNode;
  priceLabel?: React.ReactNode;
  actionLabel?: React.ReactNode;
  /** Accessible name for the save button — it has no visible text. */
  saveLabel?: string;
  onSave?: () => void;
  onViewDetails?: () => void;
};

function BoatSmallCard({
  image,
  imageAlt = "",
  location,
  title,
  rating,
  tags = [],
  price,
  priceSuffix = "/ per person",
  priceLabel = "From",
  actionLabel = "View Details",
  saveLabel = "Save to wishlist",
  onSave,
  onViewDetails,
  className,
  ...props
}: BoatSmallCardProps) {
  return (
    <Card className={cn("w-[334px] max-w-full", className)} {...props}>
      <CardMedia className="aspect-[334/200]">
        <img src={image} alt={imageAlt} />
        <button
          type="button"
          aria-label={saveLabel}
          onClick={onSave}
          className="absolute top-4 right-4 flex size-8 cursor-pointer items-center justify-center rounded-lg bg-black/12 text-white outline-none transition-colors hover:bg-black/25 focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <Bookmark className="size-4" />
        </button>
      </CardMedia>
      <CardContent className="gap-3">
        {location && (
          <span className="text-sm text-natural-600 underline underline-offset-2">{location}</span>
        )}
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          {rating != null && (
            <span className="flex shrink-0 items-center gap-1 text-base font-semibold text-foreground">
              <Star className="size-4 fill-gold text-gold" />
              {rating}
            </span>
          )}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, i) => (
              <Chip key={i} variant="neutral">
                {tag.icon}
                {tag.label}
              </Chip>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <div className="flex flex-col">
          <span className="text-sm text-natural-500">{priceLabel}</span>
          <span className="text-base text-natural-500">
            <span className="text-lg font-bold text-foreground">{price}</span> {priceSuffix}
          </span>
        </div>
        <Button variant="neutral" size="sm" onClick={onViewDetails}>
          {actionLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}

export { BoatSmallCard };
