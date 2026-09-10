import { Card, CardMedia } from "@yacht-charter/ui/components/data-display/card";
import { ImageWithFallback } from "@yacht-charter/ui/components/data-display/image-with-fallback";
import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * DestinationCard — Figma "card/destination" (610:6846). A photo with a bottom gradient
 * scrim and white title + subtitle laid over it. Homepage destination tile.
 */
type DestinationCardProps = Omit<React.ComponentProps<"div">, "title"> & {
  /** Omit (or pass an empty string) when the record has no image — the scrim and text remain. */
  image?: string;
  imageAlt?: string;
  /*
   * Photo element the card renders as — the app passes its optimized image here. `packages/ui`
   * cannot reach the app's CDN loader, so without this slot the card served a full-size original
   * straight from the origin. Overrides `image` / `imageAlt`.
   */
  imageRender?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
};

function DestinationCard({
  image,
  imageAlt = "",
  imageRender,
  title,
  subtitle,
  className,
  ...props
}: DestinationCardProps) {
  return (
    <Card variant="ghost" className={cn("w-100 max-w-full", className)} {...props}>
      <CardMedia className="aspect-auto h-75 rounded-xl md:aspect-4/3 md:h-auto">
        {imageRender ?? (
          <ImageWithFallback src={image} alt={imageAlt} fallbackClassName="bg-natural-200" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-8 text-white">
          <span className="text-2xl font-semibold">{title}</span>
          {subtitle && <span className="text-xl text-white/85">{subtitle}</span>}
        </div>
      </CardMedia>
    </Card>
  );
}

export { DestinationCard };
