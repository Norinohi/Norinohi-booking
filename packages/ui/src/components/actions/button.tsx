import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2Icon } from "lucide-react";

/*
 * Button — Figma "Buttons" (node 1020-744892).
 * Canonical variants: primary | brand | neutral | subtle.
 * Extras (derived, not in the buttons frame): destructive, link.
 * Legacy aliases kept for shadcn-CLI parity + scaffold components: secondary, outline, ghost.
 * Text = Manrope SemiBold 16 / 1.25; radius 8px; icon 16px; gap 6px.
 * Disabled is uniform across variants (bg natural-100 / text natural-300 / border natural-200).
 * `loading` is the in-flight state that shouldn't flash that grey: it keeps the variant's own
 * colours, dims them, adds a spinner and blocks pointer input. The button stays keyboard-focusable,
 * so guard the click handler against re-entry yourself.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-transparent font-semibold whitespace-nowrap leading-[1.25] transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:bg-natural-100 disabled:text-natural-300 disabled:border-natural-200 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // canonical (Figma)
        primary: "bg-primary text-primary-foreground hover:bg-natural-600",
        brand: "bg-brand text-brand-foreground hover:bg-brand-hover",
        neutral:
          "bg-secondary text-secondary-foreground border-border hover:bg-natural-100 hover:border-natural-300",
        subtle: "text-foreground hover:border-border",
        // derived extras
        destructive: "bg-destructive text-white hover:bg-error-600",
        link: "text-brand underline-offset-4 hover:underline",
        // legacy aliases (shadcn / scaffold)
        secondary:
          "bg-secondary text-secondary-foreground border-border hover:bg-natural-100 hover:border-natural-300",
        outline: "border-border bg-background hover:bg-secondary hover:text-foreground",
        ghost: "text-foreground hover:bg-natural-50",
      },
      size: {
        // canonical (Figma): text stays 16px in both, only padding/height change
        md: "h-12 px-6 text-base",
        sm: "h-8 px-4 text-base",
        // legacy sizes for scaffold parity
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        lg: "h-12 px-7 text-base",
        icon: "size-10",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-md": "size-8",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  children,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      aria-busy={loading || undefined}
      aria-disabled={loading || undefined}
      className={cn(
        buttonVariants({ variant, size }),
        loading && "pointer-events-none opacity-70",
        className,
      )}
      {...props}
    >
      {/* Leads the label rather than replacing it: a button whose text vanishes mid-click
          resizes under the cursor, and the label is what says which action is running. */}
      {loading ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
      {children}
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
