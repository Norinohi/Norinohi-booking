"use client";

import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { useUiLabels } from "@yacht-charter/ui/components/ui-labels";
import { cn } from "@yacht-charter/ui/lib/utils";
import { X } from "lucide-react";
import { createContext, useContext } from "react";

/*
 * Sheet: a panel docked to an edge of the screen, the mobile counterpart of Dialog. Built on the
 * Base UI drawer, so it swipes shut towards its own edge. Same surface as Dialog: background,
 * overlay backdrop, dialog shadow, 24px padding and gap.
 */
type SheetSide = "bottom" | "top" | "left" | "right";

const SWIPE_DIRECTION = {
  bottom: "down",
  top: "up",
  left: "left",
  right: "right",
} satisfies Record<SheetSide, DrawerPrimitive.Root.Props["swipeDirection"]>;

const VIEWPORT_SIDE = {
  bottom: "items-end justify-center",
  top: "items-start justify-center",
  left: "items-stretch justify-start",
  right: "items-stretch justify-end",
} satisfies Record<SheetSide, string>;

/* The resting position reads the swipe offset, so the panel follows the finger and eases back. */
const POPUP_SIDE = {
  bottom:
    "max-h-[90dvh] w-full rounded-t-2xl pb-[calc(--spacing(8)+env(safe-area-inset-bottom))] translate-y-(--drawer-swipe-movement-y) data-starting-style:translate-y-full data-ending-style:translate-y-full",
  top: "max-h-[90dvh] w-full rounded-b-2xl pt-[calc(--spacing(6)+env(safe-area-inset-top))] translate-y-(--drawer-swipe-movement-y) data-starting-style:-translate-y-full data-ending-style:-translate-y-full",
  left: "h-full w-[calc(100%-3rem)] max-w-108 translate-x-(--drawer-swipe-movement-x) data-starting-style:-translate-x-full data-ending-style:-translate-x-full",
  right:
    "h-full w-[calc(100%-3rem)] max-w-108 translate-x-(--drawer-swipe-movement-x) data-starting-style:translate-x-full data-ending-style:translate-x-full",
} satisfies Record<SheetSide, string>;

const SheetSideContext = createContext<SheetSide>("bottom");

interface SheetProps extends Omit<DrawerPrimitive.Root.Props, "swipeDirection"> {
  /** The edge the sheet is docked to; it swipes shut towards the same edge. */
  side?: SheetSide;
}

function Sheet({ side = "bottom", ...props }: SheetProps) {
  return (
    <SheetSideContext.Provider value={side}>
      <DrawerPrimitive.Root swipeDirection={SWIPE_DIRECTION[side]} {...props} />
    </SheetSideContext.Provider>
  );
}

function SheetTrigger(props: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="sheet-close" {...props} />;
}

interface SheetContentProps extends DrawerPrimitive.Popup.Props {
  showClose?: boolean;
  /** Accessible name of the close control; falls back to `UiLabelsProvider`. */
  closeLabel?: string;
  /** A grab bar at the top of a bottom sheet, the cue that it can be swiped down. */
  showHandle?: boolean;
  backdropClassName?: string;
}

function SheetContent({
  className,
  children,
  showClose = false,
  closeLabel,
  showHandle = false,
  backdropClassName,
  ...props
}: SheetContentProps) {
  const side = useContext(SheetSideContext);
  const labels = useUiLabels();

  return (
    <DrawerPrimitive.Portal>
      <DrawerPrimitive.Backdrop
        data-slot="sheet-backdrop"
        className={cn(
          "fixed inset-0 z-50 bg-overlay opacity-[calc(1-var(--drawer-swipe-progress))] transition-opacity duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-swiping:duration-0",
          backdropClassName,
        )}
      />
      <DrawerPrimitive.Viewport className={cn("fixed inset-0 z-50 flex", VIEWPORT_SIDE[side])}>
        <DrawerPrimitive.Popup
          data-slot="sheet-content"
          className={cn(
            "relative flex flex-col gap-6 overflow-y-auto overscroll-contain bg-background p-6 text-foreground shadow-dialog outline-none transition-transform duration-450 ease-[cubic-bezier(0.32,0.72,0,1)] data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] data-swiping:select-none data-swiping:duration-0",
            POPUP_SIDE[side],
            className,
          )}
          {...props}
        >
          {showHandle && side === "bottom" ? (
            <div
              aria-hidden
              className="mx-auto -mt-2 h-1 w-12 shrink-0 rounded-full bg-natural-100"
            />
          ) : null}
          {children}
          {showClose ? (
            <DrawerPrimitive.Close
              data-slot="sheet-close"
              aria-label={closeLabel ?? labels.close}
              className="absolute top-4 right-4 cursor-pointer text-natural-400 transition-colors hover:text-foreground [&_svg]:size-6"
            >
              <X />
            </DrawerPrimitive.Close>
          ) : null}
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPrimitive.Portal>
  );
}

function SheetBody({ className, ...props }: DrawerPrimitive.Content.Props) {
  return (
    <DrawerPrimitive.Content
      data-slot="sheet-body"
      className={cn("flex flex-col gap-6", className)}
      {...props}
    />
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex w-full flex-col gap-2 text-center", className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("flex w-full flex-col gap-2 *:w-full", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-2xl leading-[1.3] font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function SheetDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-base leading-[1.4] text-natural-600", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetBody,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  type SheetSide,
};
