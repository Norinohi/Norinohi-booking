import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { Hint } from "@yacht-charter/ui/components/overlay/hint";
import { cn } from "@yacht-charter/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/*
 * IconButton — Figma "Icon Button" (node 606-4655).
 * Circular icon-only action. Variants: primary | neutral | subtle.
 * Sizes: md = 40px, sm = 32px; icon 16px. Disabled uniform (natural-100/300/200).
 * The button has no visible text, so it needs a name: `label` sets the aria-label and shows the
 * same words as a hover hint. As another trigger's `render` (a menu's), the hint inside never
 * opens: pass `aria-label` there and wrap the outer trigger in `Hint` instead.
 */
const iconButtonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full border border-transparent transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:bg-natural-100 disabled:text-natural-300 disabled:border-natural-200 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-natural-600",
        neutral:
          "bg-secondary text-secondary-foreground border-border hover:bg-natural-100 hover:border-natural-300",
        subtle: "text-foreground hover:bg-natural-50",
      },
      size: {
        md: "size-10",
        sm: "size-8",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

function IconButton({
  className,
  variant = "primary",
  size = "md",
  label,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof iconButtonVariants> & { label?: string }) {
  const button = (
    <ButtonPrimitive
      data-slot="icon-button"
      aria-label={label}
      className={cn(iconButtonVariants({ variant, size, className }))}
      {...props}
    />
  );
  return label ? <Hint label={label}>{button}</Hint> : button;
}

export { IconButton, iconButtonVariants };
