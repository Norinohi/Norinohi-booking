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
 */
function Popover(props: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger(props: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  side,
  align = "start",
  sideOffset = 6,
  alignOffset,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, "side" | "align" | "sideOffset" | "alignOffset">) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        className="z-50 outline-none"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "flex origin-[var(--transform-origin)] flex-col items-start gap-2 rounded-lg border border-input bg-popover px-4 py-3 text-popover-foreground shadow-[4px_4px_10px_rgba(0,0,0,0.1)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverTrigger, PopoverContent };
