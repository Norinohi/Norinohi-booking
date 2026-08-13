import { Button as ButtonPrimitive } from "@base-ui/react/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardMedia,
  CardTitle,
} from "@yacht-charter/ui/components/data-display/card";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { ImageWithFallback } from "@yacht-charter/ui/components/data-display/image-with-fallback";
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
  /** Element the action renders as — pass the app's own link to make it navigate. */
  actionRender?: ButtonPrimitive.Props["render"];
  descriptionClassName?: string;
};

function TripCard({
  image,
  imageAlt = "",
  title,
  description,
  meta = [],
  actionLabel = "Explore Route",
  actionRender,
  className,
  descriptionClassName,
  ...props
}: TripCardProps) {
  return (
    <Card variant="ghost" className={cn("w-[452px] max-w-full gap-4", className)} {...props}>
      <CardMedia className="h-[240px] rounded-xl">
        <ImageWithFallback src={image} alt={imageAlt} />
      </CardMedia>
      <CardContent className="gap-3 p-0">
        <CardTitle className="text-xl leading-[1.1] md:text-2xl">{title}</CardTitle>
        {description && (
          <CardDescription className={cn("leading-[1.4]", descriptionClassName)}>
            {description}
          </CardDescription>
        )}
      </CardContent>
      <CardFooter className="p-0">
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
        <ButtonPrimitive
          nativeButton={!actionRender}
          render={actionRender}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-base font-semibold text-foreground outline-none transition-colors hover:text-brand focus-visible:text-brand"
        >
          {actionLabel}
          <ArrowRight className="size-4" />
        </ButtonPrimitive>
      </CardFooter>
    </Card>
  );
}

export { TripCard };
