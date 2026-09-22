"use client";

import type * as React from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";

/*
 * Hint — the name of an icon-only control, shown on hover and keyboard focus.
 *
 * An `aria-label` reaches a screen reader and nobody else: a mouse user hovering a bookmark or a
 * "€" had no way to learn what it did short of clicking. This shows the same words. It does not
 * set the label itself, so the child keeps its own `aria-label` and the two are written once, at
 * the call site (`IconButton`'s `label` prop does both).
 *
 * The child is rendered as the trigger, so it composes with a menu trigger or a link without an
 * extra wrapper. Touch never opens it, and a click closes it, so it does not cover the menu the
 * click opened.
 */
function Hint({
  label,
  side = "bottom",
  children,
}: {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger delay={300} render={children} />
      <TooltipContent size="label" side={side} sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export { Hint };
