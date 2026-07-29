"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * Popover — floating surface anchored to a trigger (base-ui Popover).
 * Neutral card (Figma "Menu Item" surface, node 960:346758): white bg, 1px input
 * border, 8px radius, 4/4/10 shadow, 16/12 padding, stacked children with an 8px
 * gap — so triggers and their popovers read as one system. To host a child that is
 * already a card (e.g. the Calendar), pass
 * `className="w-auto border-0 bg-transparent p-0 shadow-none"`.
 *
 * Capped at --available-height and scrolls internally, so tall content (the
 * filters panel runs to ~2700px) stays on screen instead of overflowing it.
 *
 * `PopoverArrow` goes *inside* PopoverContent (base-ui anatomy), which means that
 * internal scrolling clips it — pass `overflow-visible` on the content when using one.
 * `openOnHover` lives on the trigger, turning the same popover into a hover card.
 */
function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ className, ...props }: PopoverPrimitive.Trigger.Props) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      className={cn("cursor-pointer disabled:cursor-not-allowed", className)}
      {...props}
    />
  );
}

function PopoverContent({
  className,
  side,
  align = "start",
  sideOffset = 6,
  alignOffset,
  collisionAvoidance,
  collisionPadding,
  backdrop = false,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "collisionAvoidance" | "collisionPadding"
  > & {
    /** Dims the rest of the page. Lives inside the portal, so it is opted into here. */
    backdrop?: boolean;
  }) {
  return (
    <PopoverPrimitive.Portal>
      {backdrop ? <PopoverBackdrop /> : null}
      <PopoverPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionAvoidance={collisionAvoidance}
        collisionPadding={collisionPadding}
        className="z-50 outline-none"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "flex max-h-(--available-height) origin-(--transform-origin) flex-col items-start gap-2 overflow-y-auto rounded-lg border border-input bg-popover px-4 py-3 text-popover-foreground shadow-[4px_4px_10px_rgba(0,0,0,0.1)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

/**
 * Dims everything behind the popover. `pointer-events-none` is deliberate: a
 * hover-opened popover would close the moment the cursor crossed a backdrop that
 * captured events on its way from the trigger to the popup. Dismissal still works,
 * because base-ui listens for outside presses on the document, not on this element.
 */
function PopoverBackdrop({ className, ...props }: PopoverPrimitive.Backdrop.Props) {
  return (
    <PopoverPrimitive.Backdrop
      data-slot="popover-backdrop"
      className={cn(
        "pointer-events-none fixed inset-0 z-40 bg-overlay/60 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

/*
 * The pointer from Figma: a square rotated 45° whose inner half is clipped away,
 * so only the triangle pokes out. base-ui places it and flips it via `data-side`.
 *
 * The offsets are one pixel short of the 11px height on purpose. Sitting flush, the
 * arrow stops exactly where the popup's own 1px border begins, and that border then
 * draws a seam straight across the base of the triangle. Overlapping by a pixel lets
 * the arrow's fill paint over the border instead — it is a child of the popup, so it
 * is painted after it.
 */
function PopoverArrow({ className, ...props }: PopoverPrimitive.Arrow.Props) {
  return (
    <PopoverPrimitive.Arrow
      data-slot="popover-arrow"
      className={cn(
        "relative block h-[11px] w-[23px] overflow-clip",
        "data-[side=bottom]:top-[-10px] data-[side=top]:bottom-[-10px] data-[side=top]:rotate-180",
        "data-[side=left]:right-[-16px] data-[side=left]:rotate-90",
        "data-[side=right]:left-[-16px] data-[side=right]:-rotate-90",
        "before:absolute before:bottom-0 before:left-1/2 before:size-4 before:border before:border-input before:bg-popover before:content-[''] before:[transform:translate(-50%,50%)_rotate(45deg)]",
        className,
      )}
      {...props}
    />
  );
}

export { Popover, PopoverArrow, PopoverBackdrop, PopoverContent, PopoverTrigger };
