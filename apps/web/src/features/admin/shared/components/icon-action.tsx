"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";
import { cn } from "@yacht-charter/ui/lib/utils";
import type { ReactNode } from "react";

/* A row action in an admin table: an icon with its label as the tooltip and the accessible name. */
export default function IconAction({
  label,
  disabled,
  destructive,
  primary,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  primary?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={primary ? "brand" : "subtle"}
            size="icon-md"
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
            className={cn("[&_svg]:size-4", destructive && "text-error-500")}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
