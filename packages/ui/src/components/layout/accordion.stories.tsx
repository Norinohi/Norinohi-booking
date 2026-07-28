import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@yacht-charter/ui/components/layout/accordion";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Layout/Accordion",
  component: Accordion,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

const SECTIONS = [
  { value: "where", label: "Where to?", body: "Country, region, marina, port." },
  { value: "when", label: "When?", body: "Dates, duration and date flexibility." },
  { value: "boat", label: "Boat & Crew", body: "Boat type, cabins, berths, crew." },
] as const;

export const Default: Story = {
  render: () => (
    <Accordion
      defaultValue={["where", "when", "boat"]}
      className="w-[334px] rounded-2xl border border-border bg-card"
    >
      {SECTIONS.map((section) => (
        <AccordionItem key={section.value} value={section.value} className="p-4">
          <AccordionTrigger className="text-xl leading-[1.4] text-natural-600 hover:text-foreground">
            {section.label}
          </AccordionTrigger>
          <AccordionContent>
            <p className="pt-3 text-base text-natural-500">{section.body}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  ),
};

export const SingleOpen: Story = {
  name: "One section at a time",
  render: () => (
    <Accordion multiple={false} defaultValue={["where"]} className="w-[334px]">
      {SECTIONS.map((section) => (
        <AccordionItem key={section.value} value={section.value} className="p-4">
          <AccordionTrigger className="text-xl leading-[1.4] text-natural-600 hover:text-foreground">
            {section.label}
          </AccordionTrigger>
          <AccordionContent>
            <p className="pt-3 text-base text-natural-500">{section.body}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  ),
};

const FEES = [
  { label: "Cleaning fee", note: "Pay at check-in", price: "€150" },
  { label: "Security deposit", note: "Refundable", price: "€2,000" },
] as const;

export const PriceBreakdown: Story = {
  name: "Price breakdown style",
  render: () => (
    <Accordion
      defaultValue={["fees"]}
      className="w-[360px] rounded-2xl border border-border bg-card"
    >
      <AccordionItem value="fees" className="p-4">
        <AccordionTrigger className="text-base font-semibold leading-[1.4] text-foreground">
          Extras &amp; fees
        </AccordionTrigger>
        <AccordionContent>
          <div className="flex flex-col gap-3 pt-3">
            {FEES.map((fee) => (
              <div key={fee.label} className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <p className="text-base leading-[1.4] text-foreground">{fee.label}</p>
                  <p className="text-xs font-semibold leading-[1.3] text-natural-500">{fee.note}</p>
                </div>
                <p className="font-bold leading-[1.4] text-foreground">{fee.price}</p>
              </div>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  ),
};

export const AllCollapsed: Story = {
  name: "All collapsed",
  render: () => (
    <Accordion className="w-[334px]">
      {SECTIONS.map((section) => (
        <AccordionItem key={section.value} value={section.value} className="p-4">
          <AccordionTrigger className="text-xl leading-[1.4] text-natural-600 hover:text-foreground">
            {section.label}
          </AccordionTrigger>
          <AccordionContent>
            <p className="pt-3 text-base text-natural-500">{section.body}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  ),
};
