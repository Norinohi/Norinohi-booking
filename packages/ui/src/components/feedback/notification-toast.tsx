import { cn } from "@yacht-charter/ui/lib/utils";
import { X } from "lucide-react";

/*
 * NotificationToast — compact toast card. Figma "Notification Toast" (node 845-206792).
 * bg brand-50 (#eaf2fd); title SemiBold 14 in brand; optional message, action and close.
 * Presentational — pair with a toast manager (e.g. sonner) for stacking/auto-dismiss.
 */
function NotificationToast({
  className,
  title,
  description,
  action,
  onClose,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div
      role="status"
      className={cn("flex items-center gap-2 rounded-lg bg-brand-50 px-3 py-1", className)}
      {...props}
    >
      <div className="flex min-w-40 flex-col justify-center py-3">
        <span className="text-sm font-semibold capitalize leading-[1.2] tracking-[0.02em] text-brand">
          {title}
        </span>
        {description ? (
          <span className="text-body-caption-s text-foreground">{description}</span>
        ) : null}
      </div>
      {action}
      {onClose ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          className="shrink-0 cursor-pointer text-brand transition-colors hover:text-brand-hover [&_svg]:size-6"
        >
          <X />
        </button>
      ) : null}
    </div>
  );
}

export { NotificationToast };
