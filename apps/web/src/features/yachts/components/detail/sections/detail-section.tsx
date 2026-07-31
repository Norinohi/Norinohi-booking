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
 * header 967:69735). `id` doubles as the DOM anchor the in-page tabs will scroll to. `title` takes
 * a node because the Review heading carries a rating chip and a count beside it (967:70032).
 */
export default function DetailSection({
  id,
  title,
  children,
}: {
  id: string;
  title: ReactNode;
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
          {/* Headings/h5 — 20/1.1 on the 390 frame, 24/1.1 on both 768 and 1536. */}
          <h2 className="flex items-center gap-1 text-xl leading-5.5 font-semibold text-foreground md:text-2xl md:leading-6.5">
            {title}
          </h2>
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-3">{children}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
