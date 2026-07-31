import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@yacht-charter/ui/components/layout/accordion";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

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
    <Accordion
      id={id}
      defaultValue={[id]}
      className="scroll-mt-[calc(var(--header-h)+7.5rem)] xl:scroll-mt-[calc(var(--header-h)+3.5rem)]"
    >
      <AccordionItem value={id}>
        <AccordionTrigger
          indicator={
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-natural-50 text-foreground">
              <ChevronDown className="size-4 transition-transform duration-200 group-data-panel-open:rotate-180" />
            </span>
          }
        >
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
