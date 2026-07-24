"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "@yacht-charter/ui/lib/utils";
import { CheckIcon } from "lucide-react";

/*
 * Checkbox — Figma "Radio, checkbox, toggle" (nodes 733:31044 idle / 733:31057 checked),
 * part of the Inputs & Selection frame. 24px box, 4px radius, 1.2px natural-100 border;
 * checked fills brand (#2f80ed) with a white check. Size/shape overridable via `className`.
 */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-6 shrink-0 items-center justify-center rounded-[4px] border-[1.2px] border-input bg-transparent transition-colors outline-none",
        "after:absolute after:-inset-x-2 after:-inset-y-1.5",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-error-500 aria-invalid:ring-2 aria-invalid:ring-error-500/20",
        "data-[checked]:border-brand data-[checked]:bg-brand data-[checked]:text-brand-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current [&>svg]:size-[18px]"
      >
        <CheckIcon strokeWidth={2.5} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
