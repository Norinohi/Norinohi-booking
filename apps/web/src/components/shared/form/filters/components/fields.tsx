"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { Field } from "@yacht-charter/ui/components/form/field";
import { MultiSelect } from "@yacht-charter/ui/components/form/multi-select";
import { Select } from "@yacht-charter/ui/components/form/select";
import { Slider } from "@yacht-charter/ui/components/form/slider";
import { Switch } from "@yacht-charter/ui/components/form/switch";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@yacht-charter/ui/components/layout/accordion";
import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";

import { type Option, orderedValues } from "../lib/options";
import type { FiltersState, Range } from "../lib/state";

export interface SectionProps {
  value: FiltersState;
  set: <K extends keyof FiltersState>(key: K, next: FiltersState[K]) => void;
}

export function Section({
  value,
  title,
  children,
}: {
  value: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value} className="border-b border-border p-4">
      <AccordionTrigger className="text-xl leading-[1.4] text-natural-600 hover:text-foreground">
        {title}
      </AccordionTrigger>
      <AccordionContent>
        <div className="flex flex-col gap-3 pt-3">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

interface MultiSelectFieldProps {
  label?: string;
  ariaLabel?: string;
  options: Option[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  className?: string;
}

export function MultiSelectField({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  className,
}: MultiSelectFieldProps) {
  return (
    <Field label={label} className={className}>
      <MultiSelect
        aria-label={ariaLabel}
        className="min-w-0"
        options={options}
        value={value}
        // Written back in option order so comparing against the defaults never
        // depends on the order the boxes were ticked.
        onValueChange={(next) => onChange(orderedValues(options, next))}
        placeholder={placeholder}
        searchPlaceholder={searchPlaceholder}
      />
    </Field>
  );
}

interface SelectFieldProps {
  label?: string;
  ariaLabel?: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  /** Shows a reset button while `value` differs from `clearTo`. */
  clearable?: boolean;
  clearTo?: string;
  className?: string;
}

export function SelectField({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  clearable = false,
  clearTo,
  className,
}: SelectFieldProps) {
  const t = useTranslations("Filters");
  const resetTo = clearTo ?? options[0]?.value;
  const canClear = clearable && resetTo !== undefined && value !== resetTo;

  return (
    <Field label={label} className={className}>
      <Select
        className="h-12 w-full min-w-0"
        ariaLabel={ariaLabel}
        options={options}
        value={value}
        onValueChange={(next) => onChange(next ?? value)}
        clearable={canClear}
        clearLabel={label ? t("clearField", { label }) : t("clearSelection")}
        onClear={canClear ? () => onChange(resetTo) : undefined}
      />
    </Field>
  );
}

function UnitSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <Select
      className="h-auto w-auto min-w-0 gap-1 border-0 p-0 text-sm font-medium text-natural-600 [&_svg]:size-4"
      ariaLabel={ariaLabel}
      options={options}
      value={value}
      onValueChange={(next) => onChange(next ?? value)}
    />
  );
}

interface RangeFieldProps {
  label: string;
  limits: Range;
  value: Range;
  onChange: (value: Range) => void;
  format?: (value: number) => string;
  unit?: {
    value: string;
    options: Option[];
    onChange: (value: string) => void;
  };
  icon?: ReactNode;
  showScale?: boolean;
  /*
   * Suppresses the "+" on the top of the track, for a scale whose end is a real ceiling
   * rather than a percentile cut. A guest rating stops at five, so "5+" promises a sixth star.
   */
  boundedMax?: boolean;
}

export function RangeField({
  label,
  limits,
  value,
  onChange,
  format,
  unit,
  icon,
  showScale = true,
  boundedMax = false,
}: RangeFieldProps) {
  const t = useTranslations("Filters");
  const formatValue = (n: number) => (format ? format(n) : String(n));

  /*
   * The sliders end on the 95th percentile of the fleet, and a thumb resting on that end sends
   * no upper bound at all, so everything above it is still in the results. Printed bare, "61 ft"
   * then reads as a promise the results break: a 49 m hull comes back under a 61 ft filter. The
   * suffix is what makes the end of the track mean what the query already means.
   */
  const formatUpper = (n: number) =>
    !boundedMax && n === limits[1] ? t("andAbove", { value: formatValue(n) }) : formatValue(n);

  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className="text-sm font-semibold leading-[1.2] tracking-[0.02em] text-foreground capitalize">
        {label}
      </span>
      <div className="flex items-center gap-4">
        <span className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium leading-[1.3] text-natural-500">
          {icon}
          {formatValue(value[0])}
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-sm font-medium leading-[1.3] text-natural-500">
          {icon}
          {formatUpper(value[1])}
        </span>
        {unit ? (
          <UnitSelect
            ariaLabel={t("unitAria", { label })}
            value={unit.value}
            options={unit.options}
            onChange={unit.onChange}
          />
        ) : null}
      </div>
      <Slider
        min={limits[0]}
        max={limits[1]}
        value={value}
        onValueChange={(next) => {
          // SAFETY: the slider is given a Range, so it renders two thumbs and reports the
          // same pair back; only a scalar value would make this a number.
          onChange(next as Range);
        }}
        aria-label={label}
        showTicks
      />
      {showScale && (
        <div aria-hidden className="relative h-4.5 w-full">
          <span className="absolute left-2 -translate-x-1/2 text-sm leading-[1.3] tracking-[0.04em] text-foreground uppercase">
            {formatValue(limits[0])}
          </span>
        </div>
      )}
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  control: "switch" | "checkbox";
}

export function ToggleRow({ label, checked, onChange, control }: ToggleRowProps) {
  const labelId = useId();

  return (
    <div className="flex w-full items-center gap-2">
      {control === "switch" ? (
        <Switch aria-labelledby={labelId} checked={checked} onCheckedChange={onChange} />
      ) : (
        <Checkbox aria-labelledby={labelId} checked={checked} onCheckedChange={onChange} />
      )}
      <span id={labelId} className="flex-1 text-base leading-[1.4] text-foreground">
        {label}
      </span>
    </div>
  );
}
