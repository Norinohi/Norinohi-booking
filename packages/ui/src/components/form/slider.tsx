"use client";

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@yacht-charter/ui/lib/utils";
import * as React from "react";

/*
 * Slider — Figma "Slider" (node 734:6587, progress 0–100%), Inputs & Selection frame.
 * 12px rail on brand-50 (#eaf2fd) at 50% opacity, brand (#2f80ed) fill, 16px white thumb
 * ringed 2px brand. Optional `label` (14 SemiBold) and value read-out sit above the rail.
 * Thumb count follows the value: pass a number for a single handle, a tuple for a range.
 * The control is inset by half a thumb so handles at the extremes stay fully visible
 * instead of being clipped by the container edge.
 */
type SliderProps = SliderPrimitive.Root.Props & {
  label?: React.ReactNode;
  showValue?: boolean;
  showTicks?: boolean;
  controlClassName?: string;
};

function Slider({
  label,
  showValue = false,
  showTicks = false,
  controlClassName,
  className,
  ...props
}: SliderProps) {
  const current = props.value ?? props.defaultValue;
  const thumbCount = Array.isArray(current) ? current.length : 1;

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
        className={cn(
          "flex w-full touch-none items-center px-2 py-0.5 select-none",
          controlClassName,
        )}
      >
        <SliderPrimitive.Track className="relative h-3 w-full rounded-full bg-brand-50/50">
          {showTicks && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[repeating-linear-gradient(to_right,var(--color-natural-200)_0_1px,transparent_1px_10px)]"
            />
          )}
          <SliderPrimitive.Indicator className="rounded-full bg-brand" />
          {Array.from({ length: thumbCount }, (_, index) => (
            <SliderPrimitive.Thumb
              key={index}
              index={index}
              className="size-4 rounded-full border-2 border-brand bg-white outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
            />
          ))}
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}

export { Slider };
