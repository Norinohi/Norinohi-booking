import {
  Card,
  CardContent,
  CardDescription,
  CardMedia,
  CardTitle,
} from "@yacht-charter/ui/components/data-display/card";
import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * BoatCard — Figma "card/boat" (609:6807). A fully-rounded photo above an h5 title and a
 * secondary description, with no surrounding frame. Homepage "why this boat" tile.
 */
type BoatCardProps = Omit<React.ComponentProps<"div">, "title"> & {
  image: string;
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
    <Card variant="ghost" className={cn("w-[334px] max-w-full", className)} {...props}>
      <CardMedia className="rounded-xl">
        <img src={image} alt={imageAlt} />
      </CardMedia>
      <CardContent className="gap-1.5 p-0">
        <CardTitle className="text-2xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardContent>
    </Card>
  );
}

export { BoatCard };
