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
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <TooltipPrimitive.Portal>
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
          <TooltipPrimitive.Arrow className="data-[side=bottom]:rotate-180 data-[side=left]:-rotate-90 data-[side=right]:rotate-90">
            <svg
              viewBox="0 0 20 9"
              strokeWidth={1}
              strokeLinejoin="round"
              className="block h-[9px] w-5 fill-background stroke-border"
            >
              {/* open path: two slanted edges only, so the base merges into the popup border */}
              <path d="M0 0 L10 8 L20 0" />
            </svg>
          </TooltipPrimitive.Arrow>
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
