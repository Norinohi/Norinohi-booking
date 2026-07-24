"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@yacht-charter/ui/lib/utils";
import * as React from "react";

/*
 * Slider — Figma "Slider" (node 734:6587, progress 0–100%), Inputs & Selection frame.
 * 12px rail on brand-50 (#eaf2fd) at 50% opacity, brand (#2f80ed) fill, 16px white thumb
 * ringed 2px brand. Optional `label` (14 SemiBold) and value read-out sit above the rail.
 */
type SliderProps = SliderPrimitive.Root.Props & {
  label?: React.ReactNode;
  showValue?: boolean;
  controlClassName?: string;
};

function Slider({ label, showValue = false, controlClassName, className, ...props }: SliderProps) {
  return (
    <SliderPrimitive.Root data-slot="slider" className={cn("w-full", className)} {...props}>
      {(label != null || showValue) && (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {label != null && (
            <SliderPrimitive.Label className="text-sm font-semibold tracking-[0.02em] text-foreground">
              {label}
            </SliderPrimitive.Label>
          )}
          {showValue && <SliderPrimitive.Value className="text-sm font-medium text-natural-500" />}
        </div>
      )}
      <SliderPrimitive.Control
        data-slot="slider-control"
        className={cn("flex w-full touch-none items-center py-1.5 select-none", controlClassName)}
      >
        <SliderPrimitive.Track className="relative h-3 w-full rounded-full bg-brand-50/50">
          <SliderPrimitive.Indicator className="rounded-full bg-brand" />
          <SliderPrimitive.Thumb className="size-4 rounded-full border-2 border-brand bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50" />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
