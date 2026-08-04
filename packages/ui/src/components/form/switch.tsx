"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * Switch — Figma "Radio, checkbox, toggle" toggle (nodes 733:31059 off / 733:31068 on),
 * Inputs & Selection frame. 40x22 track, rounded-full; off track natural-100, on track
 * brand (#2f80ed). White 18px thumb slides 18px when checked.
 */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "relative inline-flex h-[22px] w-10 shrink-0 cursor-pointer items-center rounded-full bg-input p-0.5 transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[checked]:bg-brand",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="size-[18px] rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-[18px]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
