import { cn } from "@yacht-charter/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

/*
 * Chip — small tag/badge. Figma "Chip / Tag" (node 610-6892), used e.g. in Dialog.
 * brand (as designed): bg brand-50 (#eaf2fd), brand text, 4px radius, 6px padding,
 * SemiBold 14. Other variants derived from the matching ramp. Icons render at 16px.
 */
const chipVariants = cva(
  "inline-flex items-center gap-1 rounded-sm p-1.5 text-sm font-semibold leading-[1.15] [&_svg]:size-4",
  {
    variants: {
      variant: {
        brand: "bg-brand-50 text-brand",
        neutral: "bg-natural-50 text-foreground",
        success: "bg-positive-50 text-positive-600",
        warning: "bg-warning-50 text-warning-600",
        error: "bg-error-50 text-error-600",
      },
    },
    defaultVariants: { variant: "brand" },
  },
);

function Chip({
  className,
  variant = "brand",
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof chipVariants>) {
  return <span data-slot="chip" className={cn(chipVariants({ variant }), className)} {...props} />;
}

export { Chip, chipVariants };
