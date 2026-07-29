"use client";

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * Tooltip — Figma "Tooltip popover" (node 766-39534).
 * Light popover: white bg, 1px tertiary border, 6px radius, subtle card shadow,
 * 14px Manrope Medium body text, with an arrow. Roomy padding (16px), min 180 / max 280px.
 */
function TooltipProvider({ delay = 0, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 10,
  align = "center",
  alignOffset = 0,
  backdrop = false,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset"> & {
    /** Dims the rest of the page, for tooltips that land on busy surfaces like a map. */
    backdrop?: boolean;
  }) {
  return (
    <TooltipPrimitive.Portal>
      {backdrop ? (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-40 bg-overlay/60 duration-200 animate-in fade-in-0"
        />
      ) : null}
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 min-w-[180px] max-w-[280px] origin-(--transform-origin) rounded-md border border-border bg-background p-4 text-sm font-medium leading-[1.3] text-foreground shadow-[4px_4px_15px_rgba(0,0,0,0.03)] data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
          {/* Same construction as PopoverArrow: a clipped square rotated 45°, overlapping
              the popup by a pixel so its fill paints over the border that would otherwise
              draw a seam across the base of the triangle. */}
          <TooltipPrimitive.Arrow
            className={cn(
              "relative block h-[11px] w-[23px] overflow-clip",
              "data-[side=bottom]:top-[-10px] data-[side=top]:bottom-[-10px] data-[side=top]:rotate-180",
              "data-[side=left]:right-[-16px] data-[side=left]:rotate-90",
              "data-[side=right]:left-[-16px] data-[side=right]:-rotate-90",
              "before:absolute before:bottom-0 before:left-1/2 before:size-4 before:border before:border-border before:bg-background before:content-[''] before:[transform:translate(-50%,50%)_rotate(45deg)]",
            )}
          />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
