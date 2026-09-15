"use client";

import { Field } from "@yacht-charter/ui/components/form/field";
import { Radio, RadioGroup } from "@yacht-charter/ui/components/form/radio";
import { useTranslations } from "next-intl";

import DatePicker from "@/components/shared/form/date-picker";
import { dayFromNative, dayToNative } from "@/lib/date";

import { Section, type SectionProps, SelectField } from "../fields";
import { useFilterOptions } from "../../hooks/use-filter-options";

/*
 * The lengths most charters are sold in, headed apart from the rest. The facets list every length
 * up to a month, and flat that was thirty-two rows with the week buried among them.
 */
const POPULAR_DURATIONS = new Set(["3", "7", "10", "14"]);

export default function WhenSection({ value, set }: SectionProps) {
  const t = useTranslations("Filters");
  const { options } = useFilterOptions();

  const anyDuration = options.durations.filter((option) => option.value === "any");
  const popularDurations = options.durations.filter((option) =>
    POPULAR_DURATIONS.has(option.value),
  );
  const otherDurations = options.durations.filter(
    (option) => option.value !== "any" && !POPULAR_DURATIONS.has(option.value),
  );
  const durationGroups =
    popularDurations.length > 0 && otherDurations.length > 0
      ? [
          { key: "any", options: anyDuration },
          { key: "popular", label: t("groups.popularDurations"), options: popularDurations },
          { key: "other", label: t("groups.otherDurations"), options: otherDurations },
        ]
      : undefined;

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
        groups={durationGroups}
        value={value.duration}
        onChange={(next) => set("duration", next)}
        clearable
      />

      <Field label={t("labels.dateFlexibility")} className="gap-3">
        <RadioGroup
          value={value.dateFlexibility}
          onValueChange={(next) => {
            /* Only a rendered radio can be picked, so the value is one of these options. */
            const option = options.dateFlexibility.find((item) => item.value === next);
            if (option) set("dateFlexibility", option.value);
          }}
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
