import { cn } from "@yacht-charter/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/*
 * Card — Figma "Cards & Product Patterns" (node 1020-743800). Base surface for the yacht
 * cards. 12px radius (Figma "border radius/md" → rounded-xl). Variants:
 *   default — white card with a hairline border; media clips to the top corners.
 *   ghost   — no frame; the media rounds itself (destination / boat cards).
 *   filled  — brand-50 wash (testimonial).
 * Compose CardMedia / CardContent / CardTitle / CardDescription / CardFooter inside.
 */
const cardVariants = cva("flex flex-col rounded-xl", {
  variants: {
    variant: {
      default: "overflow-hidden border border-border bg-card",
      ghost: "gap-3 bg-transparent",
      filled: "overflow-hidden bg-brand-50",
    },
  },
  defaultVariants: { variant: "default" },
});

function Card({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ variant }), className)} {...props} />;
}

/** Media well — sits flush at the top of framed cards; any nested <img> fills and covers. */
function CardMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-media"
      className={cn(
        "relative aspect-[4/3] overflow-hidden [&_img]:size-full [&_img]:object-cover",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("flex flex-col gap-2 p-4", className)} {...props} />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"h3">) {
  return (
    <h3
      data-slot="card-title"
      className={cn("text-xl font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-base leading-relaxed text-natural-600", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center justify-between gap-3 px-4 pb-4", className)}
      {...props}
    />
  );
}

export { Card, CardMedia, CardContent, CardTitle, CardDescription, CardFooter, cardVariants };
