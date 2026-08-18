import {
  Card,
  CardContent,
  CardDescription,
  CardMedia,
  CardTitle,
} from "@yacht-charter/ui/components/data-display/card";
import { ImageWithFallback } from "@yacht-charter/ui/components/data-display/image-with-fallback";
import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * BoatCard — Figma "card/boat" (609:6807). A fully-rounded photo above an h5 title and a
 * secondary description, with no surrounding frame. Homepage "why this boat" tile.
 */
type BoatCardProps = Omit<React.ComponentProps<"div">, "title"> & {
  /** Omit (or pass an empty string) when the record has no image — the media box stays, empty. */
  image?: string;
  imageAlt?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
};

function BoatCard({
  image,
  imageAlt = "",
  title,
  description,
  className,
  ...props
}: BoatCardProps) {
  return (
    <Card variant="ghost" className={cn("w-[334px] max-w-full gap-5", className)} {...props}>
      <CardMedia className="h-[224px] rounded-xl">
        <ImageWithFallback src={image} alt={imageAlt} />
      </CardMedia>
      <CardContent className="gap-3 p-0">
        <CardTitle className="text-xl leading-[1.1] md:text-2xl">{title}</CardTitle>
        {description && (
          <CardDescription className="text-lg leading-[1.4] md:text-xl">
            {description}
          </CardDescription>
        )}
      </CardContent>
    </Card>
  );
}

export { BoatCard };
