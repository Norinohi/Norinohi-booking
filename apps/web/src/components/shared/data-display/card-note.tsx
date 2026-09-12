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
 *
 * Callers pass `w-full`: the note sits in a column whose items are aligned to its start, which
 * sizes each one to its own content rather than to the column, so a label long enough --
 * "Поворотна застава: 1 700 EUR" against English's "Refundable deposit" -- painted past the
 * card's edge instead of wrapping. Width from the caller and `wrap-break-word` here cover the
 * two halves of that: the column decides how wide, the text agrees to break.
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
              "min-w-0 cursor-pointer items-start gap-1 text-left text-xs font-semibold leading-[1.3] wrap-break-word text-brand underline decoration-dotted outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
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
