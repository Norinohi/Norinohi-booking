"use client";

import { Calendar } from "@yacht-charter/ui/components/form/calendar";
import { Field } from "@yacht-charter/ui/components/form/field";
import { Radio, RadioGroup } from "@yacht-charter/ui/components/form/radio";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@yacht-charter/ui/components/overlay/popover";
import { Calendar as CalendarIcon } from "lucide-react";

import { dayFromNative, dayToNative, formatDay } from "@/lib/date";

import { Section, type SectionProps, SelectField } from "../fields";
import { DATE_FLEXIBILITY, DURATIONS } from "../../lib/options";

export default function WhenSection({ value, set }: SectionProps) {
  return (
    <Section value="when" title="When?">
      <Field label="Start date">
        <Popover>
          <PopoverTrigger className="group flex h-12 w-full items-center gap-2 rounded-lg border border-input bg-transparent p-3 text-left text-base transition-colors outline-none hover:border-natural-200 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 data-popup-open:border-foreground">
            <CalendarIcon className="size-6 shrink-0 text-foreground" />
            <span className={value.startDate ? "text-foreground" : "text-natural-300"}>
              {value.startDate ? formatDay(value.startDate) : "Any date"}
            </span>
          </PopoverTrigger>
          <PopoverContent className="w-auto border-0 bg-transparent p-0 shadow-none">
            <Calendar
              selected={dayToNative(value.startDate)}
              onSelect={(next) => set("startDate", next ? dayFromNative(next) : null)}
            />
          </PopoverContent>
        </Popover>
      </Field>

      <SelectField
        label="Duration"
        options={DURATIONS}
        value={value.duration}
        onChange={(next) => set("duration", next)}
        clearable
      />

      <Field label="Date flexibility" className="gap-3">
        <RadioGroup
          value={value.dateFlexibility}
          onValueChange={(next) => set("dateFlexibility", next as string)}
          className="flex w-full flex-col gap-3"
        >
          {DATE_FLEXIBILITY.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 text-base leading-[1.4] text-foreground"
            >
              <Radio value={option.value} />
              {option.label}
            </label>
          ))}
        </RadioGroup>
      </Field>
    </Section>
  );
}
