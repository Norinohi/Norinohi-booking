"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

/* Opens on tap as well as hover: a touch screen has no hover to reveal the hint with. */
export function YachtCardPriceLabel({
  label,
  hint,
  className,
}: {
  label: string;
  hint?: string;
  className?: string;
}) {
  const t = useTranslations("Common.boatCard");
  const [open, setOpen] = useState(false);

  if (!hint) return <span className={className}>{label}</span>;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {label}
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={t("priceHintLabel")}
              onClick={() => setOpen(true)}
              className="shrink-0 cursor-pointer rounded-full text-natural-500 outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          }
        >
          <Info className="size-4" />
        </TooltipTrigger>
        <TooltipContent backdrop>{hint}</TooltipContent>
      </Tooltip>
    </span>
  );
}
