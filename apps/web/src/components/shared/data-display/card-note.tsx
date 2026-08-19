"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Info } from "lucide-react";
import { useState } from "react";

/**
 * The money footnote under a card's price. It carries its own tooltip because the
 * slot holds a different figure per caller: a catalogue card states the base's
 * refundable deposit, a booking card states what was actually prepaid, and one
 * explanation cannot be true of both.
 */
export type CardNote = { label: string; tooltip: string };

export default function CardNote({
  note,
  backdrop,
  className,
}: {
  note: CardNote;
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
        {note.label}
      </TooltipTrigger>
      <TooltipContent backdrop={backdrop}>{note.tooltip}</TooltipContent>
    </Tooltip>
  );
}
