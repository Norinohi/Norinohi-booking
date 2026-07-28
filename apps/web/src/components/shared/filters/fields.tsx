"use client";

import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import { Field } from "@yacht-charter/ui/components/form/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
import { Slider } from "@yacht-charter/ui/components/form/slider";
import { Switch } from "@yacht-charter/ui/components/form/switch";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@yacht-charter/ui/components/layout/accordion";
import { type ReactNode, useId } from "react";

import type { Option } from "./filters-options";
import type { FiltersState, Range } from "./filters-state";

export type SectionProps = {
  value: FiltersState;
  set: <K extends keyof FiltersState>(key: K, next: FiltersState[K]) => void;
};

export function labelOf(options: Option[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? "";
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

export function SelectField({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  className,
}: {
  label?: string;
  ariaLabel?: string;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Field label={label} className={className}>
      <Select value={value} onValueChange={(next) => onChange((next as string) ?? value)}>
        <SelectTrigger aria-label={ariaLabel} className="h-12 w-full min-w-0">
          <SelectValue>{(current) => labelOf(options, current as string)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
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
    <Select value={value} onValueChange={(next) => onChange((next as string) ?? value)}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-auto w-auto min-w-0 gap-1 border-0 p-0 text-sm font-medium text-natural-600 [&_svg]:size-4"
      >
        <SelectValue>{(current) => labelOf(options, current as string)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
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
}: {
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
}) {
  const show = (n: number) => (format ? format(n) : String(n));

  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className="text-sm font-semibold leading-[1.2] tracking-[0.02em] text-foreground capitalize">
        {label}
      </span>
      <div className="flex items-center gap-4">
        <span className="flex min-w-0 flex-1 items-center gap-1 text-sm font-medium leading-[1.3] text-natural-500">
          {icon}
          {show(value[0])}
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-sm font-medium leading-[1.3] text-natural-500">
          {icon}
          {show(value[1])}
        </span>
        {unit ? (
          <UnitSelect
            ariaLabel={`${label} unit`}
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
        onValueChange={(next) => onChange(next as Range)}
        aria-label={label}
        showTicks
      />
      {showScale && (
        <div aria-hidden className="relative h-[18px] w-full">
          <span className="absolute left-2 -translate-x-1/2 text-sm leading-[1.3] tracking-[0.04em] text-foreground uppercase">
            {show(limits[0])}
          </span>
        </div>
      )}
    </div>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
  control,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  control: "switch" | "checkbox";
}) {
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
