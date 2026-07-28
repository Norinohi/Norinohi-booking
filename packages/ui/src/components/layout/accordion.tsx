"use client";

import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ChevronDown } from "lucide-react";

/*
 * Accordion — base-ui accordion in the project's shape (Figma: Filters section
 * headers 995:93214, price breakdown 993:75127).
 * Deliberately typography-free: the trigger only supplies layout, focus and the
 * 20px chevron that flips on open, because usages differ (filters use Manrope
 * Regular 20 / natural-600, the price breakdown uses 16 with a sub-label). Pass
 * type styles via className. Panel height animates off --accordion-panel-height.
 *
 * `multiple` defaults to true here (base-ui defaults it to false): the filter
 * sections are all open at once and toggle independently. Pass `multiple={false}`
 * for the one-at-a-time behaviour.
 *
 * Space the panel from its trigger with padding INSIDE AccordionContent, never a
 * flex `gap` on AccordionItem — gap does not animate, so it survives the height
 * transition and then snaps away, making the content jump on close.
 */
function Accordion({ className, multiple = true, ...props }: AccordionPrimitive.Root.Props) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      multiple={multiple}
      className={cn("flex w-full flex-col", className)}
      {...props}
    />
  );
}

function AccordionItem({ className, ...props }: AccordionPrimitive.Item.Props) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("flex w-full flex-col", className)}
      {...props}
    />
  );
}

function AccordionTrigger({ className, children, ...props }: AccordionPrimitive.Trigger.Props) {
  return (
    <AccordionPrimitive.Header className="flex w-full">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "group flex w-full cursor-pointer items-center justify-between gap-3 bg-transparent text-left transition-colors outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring/40",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="size-5 shrink-0 transition-transform duration-200 `group-data-panel-open:rotate-180" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({ className, children, ...props }: AccordionPrimitive.Panel.Props) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className={cn(
        "h-(--accordion-panel-height) overflow-hidden transition-[height] duration-200 ease-out data-ending-style:h-0 data-starting-style:h-0",
        className,
      )}
      {...props}
    >
      {children}
    </AccordionPrimitive.Panel>
  );
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
