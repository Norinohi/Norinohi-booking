"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useUiLabels } from "@yacht-charter/ui/components/ui-labels";
import { X } from "lucide-react";

/*
 * Dialog — centered modal. Figma "Dialog" (node 845-208218).
 * White surface, 8px radius, 24px padding, 24px gap, 432px wide, soft shadow.
 * Header is centred (illustration → chip → title → description); footer stacks
 * full-width buttons. Backdrop uses the overlay token.
 */
function Dialog(props: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogContent({
  className,
  children,
  showClose = false,
  mobileSheet = false,
  backdropClassName,
  closeClassName,
  closeLabel,
  ...props
}: DialogPrimitive.Popup.Props & {
  showClose?: boolean;
  /** Accessible name of the close control; falls back to `UiLabelsProvider`. */
  closeLabel?: string;
  mobileSheet?: boolean;
  /** Restyle the dimmed backdrop, e.g. `max-md:bg-transparent` for page-like mobile overlays. */
  backdropClassName?: string;
  /**
   * Restyle the close control. It is a bare glyph on the dialog's own surface, which a dialog
   * whose content reaches the edges — an image, a map — does not give it.
   */
  closeClassName?: string;
}) {
  const labels = useUiLabels();
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={cn(
          "fixed inset-0 z-50 bg-overlay data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          backdropClassName,
        )}
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // Common surface
          "fixed z-50 flex flex-col items-center gap-6 bg-background p-6 shadow-[4px_4px_20px_rgba(0,0,0,0.1)] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          // Positioning: `mobileSheet` docks to the bottom as a sheet on mobile and reverts to
          // the centered dialog from `md` up; the default stays centered at every width.
          mobileSheet
            ? "inset-x-0 bottom-0 w-full rounded-t-2xl pb-8 data-open:slide-in-from-bottom-4 data-closed:slide-out-to-bottom-4 md:inset-x-auto md:bottom-auto md:top-1/2 md:left-1/2 md:w-[calc(100%-2rem)] md:max-w-[432px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:pb-6 md:data-open:zoom-in-95 md:data-closed:zoom-out-95"
            : "top-1/2 left-1/2 w-[calc(100%-2rem)] max-w-[432px] -translate-x-1/2 -translate-y-1/2 rounded-lg data-open:zoom-in-95 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            aria-label={closeLabel ?? labels.close}
            className={cn(
              "absolute top-4 right-4 cursor-pointer text-natural-400 transition-colors hover:text-foreground [&_svg]:size-6",
              closeClassName,
            )}
          >
            <X />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex w-full flex-col items-center gap-2 text-center", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex w-full flex-col gap-2 [&>*]:w-full", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-2xl leading-[1.3] font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-base leading-[1.4] text-natural-600", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
