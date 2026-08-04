"use client";

import { Field } from "@yacht-charter/ui/components/form/field";
import { Radio, RadioGroup } from "@yacht-charter/ui/components/form/radio";
import { useTranslations } from "next-intl";

import DatePicker from "@/components/shared/form/date-picker";
import { dayFromNative, dayToNative } from "@/lib/date";

import { Section, type SectionProps, SelectField } from "../fields";
import { useFilterOptions } from "../../hooks/use-filter-options";

export default function WhenSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");
  const options = useFilterOptions();

  return (
    <Section value="when" title={t("sections.when")}>
      <Field label={t("labels.startDate")}>
        <DatePicker
          value={dayToNative(value.startDate)}
          onValueChange={(next) => set("startDate", next ? dayFromNative(next) : null)}
          placeholder={t("placeholders.anyDate")}
          contentClassName="w-auto"
        />
      </Field>

      <SelectField
        label={t("labels.duration")}
        options={options.durations}
        value={value.duration}
        onChange={(next) => set("duration", next)}
        clearable
      />

      <Field label={t("labels.dateFlexibility")} className="gap-3">
        <RadioGroup
          value={value.dateFlexibility}
          onValueChange={(next) => set("dateFlexibility", next as string)}
          className="flex w-full flex-col gap-3"
        >
          {options.dateFlexibility.map((option) => (
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
