"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { XIcon } from "lucide-react";

/*
 * FieldClear — the reset affordance for trigger-shaped fields (select, multi-select,
 * date popover). It sits *over* the trigger rather than inside it: those triggers are
 * `<button>`s, and a nested button is invalid HTML and unreachable by keyboard.
 * The parent must be `relative`; the trigger's label needs `pr-6` so text truncates
 * before running under it. Placed left of the 24px chevron with a 8px gap.
 */
function FieldClear({
  onClear,
  label,
  className,
  ...props
}: React.ComponentProps<"button"> & { onClear: () => void; label: string }) {
  return (
    <button
      type="button"
      data-slot="field-clear"
      aria-label={label}
      onClick={onClear}
      className={cn(
        "absolute top-1/2 right-11 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-xs text-natural-500 transition-colors outline-none",
        "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
      {...props}
    >
      <XIcon className="size-4" />
    </button>
  );
}

export { FieldClear };
