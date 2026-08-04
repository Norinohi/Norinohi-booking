import { cn } from "@yacht-charter/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";

/*
 * Chip — small tag/badge. Figma "Chip / Tag" (node 610-6892), used e.g. in Dialog.
 * brand (as designed): bg brand-50 (#eaf2fd), brand text, 4px radius, 6px padding,
 * SemiBold 14. Other variants derived from the matching ramp. Icons render at 16px.
 * `outline` + `onRemove` is the applied-filter chip — Figma node 960-345916.
 */
const chipVariants = cva(
  "inline-flex items-center gap-1 rounded-sm p-1.5 text-sm font-semibold leading-[1.15] [&_svg]:size-4",
  {
    variants: {
      variant: {
        brand: "bg-brand-50 text-brand",
        neutral: "bg-natural-50 text-foreground",
        // p-[5px] + 1px border keeps the 28px box the filled variants get from p-1.5
        outline: "border border-natural-50 p-[5px] text-foreground",
        success: "bg-positive-50 text-positive-600",
        warning: "bg-warning-50 text-warning-600",
        error: "bg-error-50 text-error-600",
      },
    },
    defaultVariants: { variant: "brand" },
  },
);

type ChipProps = React.ComponentProps<"span"> &
  VariantProps<typeof chipVariants> & {
    /** Renders a trailing dismiss button. `removeLabel` names it for screen readers. */
    onRemove?: () => void;
    removeLabel?: string;
  };

function Chip({
  className,
  variant = "brand",
  onRemove,
  removeLabel,
  children,
  ...props
}: ChipProps) {
  return (
    <span data-slot="chip" className={cn(chipVariants({ variant }), className)} {...props}>
      {children}
      {onRemove ? (
        <button
          type="button"
          data-slot="chip-remove"
          aria-label={removeLabel ?? "Remove"}
          onClick={onRemove}
          className="-m-0.5 flex cursor-pointer items-center rounded-xs p-0.5 text-current opacity-70 transition-opacity outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <X />
        </button>
      ) : null}
    </span>
  );
}

export { Chip, chipVariants };
