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

export default function PrepaymentNote({
  label,
  backdrop,
  className,
}: {
  label: string;
  backdrop?: boolean;
  className?: string;
}) {
  const t = useTranslations("Common.boatCard");
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
      <TooltipContent backdrop={backdrop}>{t("prepaymentInfo")}</TooltipContent>
    </Tooltip>
  );
}
