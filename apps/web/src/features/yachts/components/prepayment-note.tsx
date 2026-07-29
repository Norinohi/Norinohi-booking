"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Info } from "lucide-react";
import { useState } from "react";

/*
 * The prepayment line on a boat card, and the tooltip explaining what the sum is.
 * Held open by state as well as hover: a tooltip alone never opens on a touch screen,
 * where this is the only place the explanation exists.
 */
const EXPLANATION =
  "This is a refundable deposit held in case of damages during your trip. You'll get it back after check-out if everything is in good condition.";

export default function PrepaymentNote({
  label,
  backdrop,
  className,
}: {
  label: string;
  /** On the map the card floats over tiles, so the tooltip needs the page dimmed behind it. */
  backdrop?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "cursor-pointer items-center gap-1 whitespace-nowrap text-xs font-semibold leading-[1.3] text-brand underline decoration-dotted outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              className,
            )}
          />
        }
      >
        <Info className="size-4 shrink-0" />
        {label}
      </TooltipTrigger>
      <TooltipContent backdrop={backdrop}>{EXPLANATION}</TooltipContent>
    </Tooltip>
  );
}
