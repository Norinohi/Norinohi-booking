import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@yacht-charter/ui/components/layout/accordion";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/*
 * DetailSection — the collapsible section shell every yacht-detail block sits in (Figma section
 * header 967:69735). `id` doubles as the DOM anchor the in-page tabs will scroll to.
 */
export default function DetailSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Accordion id={id} defaultValue={[id]} className="scroll-mt-24">
      <AccordionItem value={id}>
        <AccordionTrigger
          indicator={
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-natural-50 text-foreground">
              <ChevronDown className="size-4 transition-transform duration-200 group-data-panel-open:rotate-180" />
            </span>
          }
        >
          <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-3">{children}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
