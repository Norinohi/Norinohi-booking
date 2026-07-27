import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardMedia,
  CardTitle,
} from "@yacht-charter/ui/components/data-display/card";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowRight } from "lucide-react";

/*
 * TripCard — Figma "card/trip" (610:7006). Framed card: photo, h5 title + description, and a
 * footer with meta chips beside an "Explore Route →" action.
 */
type TripCardProps = Omit<React.ComponentProps<"div">, "title"> & {
  image: string;
  imageAlt?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: { label: string; icon?: React.ReactNode }[];
  actionLabel?: React.ReactNode;
  onAction?: () => void;
};

function TripCard({
  image,
  imageAlt = "",
  title,
  description,
  meta = [],
  actionLabel = "Explore Route",
  onAction,
  className,
  ...props
}: TripCardProps) {
  return (
    <Card className={cn("w-[452px] max-w-full", className)} {...props}>
      <CardMedia className="aspect-[16/9]">
        <img src={image} alt={imageAlt} />
      </CardMedia>
      <CardContent className="gap-2">
        <CardTitle className="text-2xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardContent>
      <CardFooter>
        {meta.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {meta.map((item, i) => (
              <Chip key={i} variant="brand">
                {item.icon}
                {item.label}
              </Chip>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onAction}
          className="flex shrink-0 items-center gap-1.5 text-base font-semibold text-foreground outline-none transition-colors hover:text-brand focus-visible:text-brand"
        >
          {actionLabel}
          <ArrowRight className="size-4" />
        </button>
      </CardFooter>
    </Card>
  );
}

export { TripCard };
