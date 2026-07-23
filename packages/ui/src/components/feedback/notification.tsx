import { cn } from "@yacht-charter/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Info } from "lucide-react";

/*
 * Notification — inline banner. Figma "Notification" (node 860-41306).
 * Info (as designed): bg brand-50 (#eaf2fd), 1px brand border, icon brand, 16px text.
 * success/warning/error are derived from the same recipe with the matching ramp.
 */
const notificationVariants = cva(
  "flex items-center gap-2 rounded-lg border p-[14px] text-base leading-[1.4] text-foreground",
  {
    variants: {
      variant: {
        info: "border-brand bg-brand-50 [&_[data-slot=notification-icon]]:text-brand",
        success:
          "border-positive-600 bg-positive-50 [&_[data-slot=notification-icon]]:text-positive-600",
        warning:
          "border-warning-600 bg-warning-50 [&_[data-slot=notification-icon]]:text-warning-600",
        error: "border-error-600 bg-error-50 [&_[data-slot=notification-icon]]:text-error-600",
      },
    },
    defaultVariants: { variant: "info" },
  },
);

function Notification({
  className,
  variant = "info",
  icon,
  children,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof notificationVariants> & { icon?: React.ReactNode }) {
  return (
    <div role="status" className={cn(notificationVariants({ variant }), className)} {...props}>
      {icon !== null && (
        <span data-slot="notification-icon" className="shrink-0 [&_svg]:size-6">
          {icon ?? <Info />}
        </span>
      )}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export { Notification, notificationVariants };
