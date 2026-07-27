import { Card, CardMedia } from "@yacht-charter/ui/components/data-display/card";
import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * DestinationCard — Figma "card/destination" (610:6846). A photo with a bottom gradient
 * scrim and white title + subtitle laid over it. Homepage destination tile.
 */
type DestinationCardProps = Omit<React.ComponentProps<"div">, "title"> & {
  image: string;
  imageAlt?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
};

function DestinationCard({
  image,
  imageAlt = "",
  title,
  subtitle,
  className,
  ...props
}: DestinationCardProps) {
  return (
    <Card variant="ghost" className={cn("w-[400px] max-w-full", className)} {...props}>
      <CardMedia className="aspect-[4/3] rounded-xl">
        <img src={image} alt={imageAlt} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-5 text-white">
          <span className="text-2xl font-semibold">{title}</span>
          {subtitle && <span className="text-base text-white/85">{subtitle}</span>}
        </div>
      </CardMedia>
    </Card>
  );
}

export { DestinationCard };
