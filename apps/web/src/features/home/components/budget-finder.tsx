import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

/*
 * BudgetFinder — Figma "Main Page" › Find Yachts By Your Budget (node 530:3117). A centered H2
 * over a brand-tinted bordered panel holding four labelled selectors, with a brand "View Results"
 * button centered underneath. Selectors are the design-system Select primitive (client islands);
 * the section itself stays a Server Component. Real query wiring lands with the search work.
 */
type BudgetSelect = {
  label: string;
  defaultValue: string;
  options: string[];
};

const SELECTS: BudgetSelect[] = [
  {
    label: "Budget Per Person",
    defaultValue: "€300–600",
    options: ["€0–300", "€300–600", "€600–1000", "€1000+"],
  },
  {
    label: "People",
    defaultValue: "2-4",
    options: ["1-2", "2-4", "4-6", "6-8", "8+"],
  },
  {
    label: "Skipper",
    defaultValue: "Yes",
    options: ["Yes", "No", "Optional"],
  },
  {
    label: "Destinations (Optional)",
    defaultValue: "All Destinations",
    options: ["All Destinations", "Croatia", "Greece", "Italy", "Turkey", "Caribbean"],
  },
];

export default function BudgetFinder() {
  return (
    <section className="w-full">
      <div className="mx-auto flex max-w-[1536px] flex-col gap-8 px-4 py-[60px] md:px-[54px] md:pt-[70px] md:pb-[48px] 2xl:gap-10 2xl:px-[70px] 2xl:pt-[100px] 2xl:pb-[60px]">
        <h2 className="text-h2 text-center text-foreground">Find Yachts By Your Budget</h2>

        <div className="flex flex-col gap-8 2xl:gap-6">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 rounded-3xl border border-brand-100 bg-brand-50 px-6 pt-6 pb-[30px] md:grid-cols-2 xl:grid-cols-4">
            {SELECTS.map((select) => (
              <div key={select.label} className="flex flex-col gap-1.5">
                <span className="text-sm leading-[1.2] font-semibold text-natural-700">
                  {select.label}
                </span>
                <Select defaultValue={select.defaultValue}>
                  <SelectTrigger className="h-12 bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {select.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <Button variant="brand" size="md" nativeButton={false} render={<Link href="/yachts" />}>
              View Results
              <ArrowUpRight />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
