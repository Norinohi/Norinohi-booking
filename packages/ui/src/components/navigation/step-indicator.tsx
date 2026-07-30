"use client";

import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * StepIndicator — Figma "Step Indicator" (node 994:79358), Reusable Sections.
 * A full-width segmented progress bar: `total` equal pill segments, the first
 * `current` filled brand (#2f80ed) and the rest natural-100, with a brand
 * "Step X of Y" label (Body xl) below. Used across the multi-step booking flow.
 * Each segment is a natural-100 track clipping a brand fill that scales from its
 * left edge, so advancing a step grows only that segment and going back drains it.
 * The transition never runs on first paint, since the initial scale is already final.
 */
type StepIndicatorProps = Omit<React.ComponentProps<"div">, "children"> & {
  /** Total number of steps. */
  total: number;
  /** Current step (1-based); segments 1…current render filled. */
  current: number;
  /** Hide the "Step X of Y" label, or pass a render fn to customise it. */
  label?: boolean | ((current: number, total: number) => React.ReactNode);
  /** Accessible name for the progress bar; defaults to the English "Step X of Y". */
  progressLabel?: string;
};

function StepIndicator({
  total,
  current,
  label = true,
  progressLabel,
  className,
  ...props
}: StepIndicatorProps) {
  const clamped = Math.max(0, Math.min(current, total));
  return (
    <div
      data-slot="step-indicator"
      className={cn("flex w-full flex-col gap-3", className)}
      {...props}
    >
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={clamped}
        aria-label={progressLabel ?? `Step ${clamped} of ${total}`}
        className="flex w-full gap-4"
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            data-active={i < clamped || undefined}
            className="group h-1.5 flex-1 overflow-hidden rounded-full bg-natural-100"
          >
            <span className="block h-full origin-left scale-x-0 rounded-full bg-brand transition-transform duration-500 ease-out group-data-active:scale-x-100 motion-reduce:transition-none" />
          </span>
        ))}
      </div>
      {label !== false && (
        <span className="text-body-xl text-brand">
          {typeof label === "function" ? label(clamped, total) : `Step ${clamped} of ${total}`}
        </span>
      )}
    </div>
  );
}

export { StepIndicator };
