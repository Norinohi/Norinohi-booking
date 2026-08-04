"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * Radio — Figma "Radio, checkbox, toggle" (nodes 733:31045 idle / 733:31047 active),
 * Inputs & Selection frame. 24px circle, 1.2px natural-100 border; when selected the
 * border turns brand and a 12px brand (#2f80ed) dot fills the centre.
 * Always compose <Radio> inside <RadioGroup>.
 */
function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    />
  );
}

function Radio({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio"
      className={cn(
        "relative flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-[1.2px] border-input bg-transparent transition-colors outline-none",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[checked]:border-brand",
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-indicator"
        className="size-3 rounded-full bg-brand data-[unchecked]:hidden"
      />
    </RadioPrimitive.Root>
  );
}

export { Radio, RadioGroup };
