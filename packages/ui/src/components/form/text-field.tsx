"use client";

import { cn } from "@yacht-charter/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

/*
 * TextField — Figma "Text field" (node 730:9030), part of the Inputs & Selection frame.
 * Composite: Label (14 SemiBold) + bordered Field + Supporting text (12 Regular), 6px gaps.
 * Field: 1px border, 8px radius, 12px padding, 8px gap, 16px Regular text, placeholder natural-300.
 * status default|error|success recolours the label, the border and the supporting text
 * (neutral / error-600 / positive-600), so a validation message reads in the same red as its field.
 * Under `FormControl` there is no `status` to pass, so `aria-invalid` — which `FormControl`
 * sets — implies `status="error"` on its own.
 * Runtime states from the design (Empty/Focused/Typing/Filled) are just focus + value.
 * `multiline` renders the "big text field" (textarea); left/right 24px icon slots are optional.
 */
const fieldVariants = cva(
  "flex w-full gap-2 rounded-lg border bg-transparent p-3 text-foreground transition-colors [&_[data-slot=text-field-icon]]:text-natural-500 [&_[data-slot=text-field-icon]_svg]:size-6",
  {
    variants: {
      status: {
        default: "border-input hover:border-natural-200 focus-within:border-foreground",
        error: "border-error-600 focus-within:border-error-600",
        success: "border-positive-600 focus-within:border-positive-600",
      },
      multiline: {
        true: "min-h-[173px] items-start",
        false: "items-center",
      },
    },
    defaultVariants: { status: "default", multiline: false },
  },
);

const labelVariants = cva("text-sm font-semibold leading-[1.2] tracking-[0.02em]", {
  variants: {
    status: {
      default: "text-foreground",
      error: "text-error-500",
      success: "text-positive-500",
    },
  },
  defaultVariants: { status: "default" },
});

const supportVariants = cva("text-xs leading-[1.2] tracking-[0.02em]", {
  variants: {
    status: {
      default: "text-foreground",
      error: "text-error-500",
      success: "text-positive-500",
    },
  },
  defaultVariants: { status: "default" },
});

const controlClassName =
  "min-w-0 flex-1 bg-transparent text-base leading-[1.4] text-foreground outline-none placeholder:text-placeholder-foreground disabled:cursor-not-allowed";

type TextFieldOwnProps = {
  label?: React.ReactNode;
  supportingText?: React.ReactNode;
  startIcon?: React.ReactNode;
  endIcon?: React.ReactNode;
  containerClassName?: string;
  fieldClassName?: string;
} & Pick<VariantProps<typeof fieldVariants>, "status">;

type TextFieldProps =
  | (TextFieldOwnProps & { multiline?: false } & Omit<
        React.ComponentProps<"input">,
        keyof TextFieldOwnProps | "multiline"
      >)
  | (TextFieldOwnProps & { multiline: true } & Omit<
        React.ComponentProps<"textarea">,
        keyof TextFieldOwnProps | "multiline"
      >);

function TextField(props: TextFieldProps) {
  const {
    label,
    supportingText,
    status: statusProp,
    startIcon,
    endIcon,
    containerClassName,
    fieldClassName,
    className,
    id: idProp,
    multiline = false,
    disabled,
    ...rest
  } = props;

  const invalid = rest["aria-invalid"] === true || rest["aria-invalid"] === "true";
  const status = statusProp ?? (invalid ? "error" : "default");

  const reactId = React.useId();
  const id = idProp ?? reactId;
  const supportId = supportingText ? `${id}-support` : undefined;

  // SAFETY: `multiline` and `rest` come from the same discriminated union, but
  // destructuring severs the link, so `rest` stays the union of both prop sets.
  // Each branch spreads it onto the element its own discriminant selected.
  const control = multiline ? (
    <textarea
      id={id}
      data-slot="text-field-control"
      disabled={disabled}
      aria-invalid={status === "error" || undefined}
      aria-describedby={supportId}
      className={cn(controlClassName, "field-sizing-content resize-none", className)}
      {...(rest as React.ComponentProps<"textarea">)}
    />
  ) : (
    <input
      id={id}
      data-slot="text-field-control"
      disabled={disabled}
      aria-invalid={status === "error" || undefined}
      aria-describedby={supportId}
      className={cn(controlClassName, className)}
      {...(rest as React.ComponentProps<"input">)}
    />
  );

  return (
    <div
      data-slot="text-field"
      className={cn("flex w-full flex-col items-start gap-1.5", containerClassName)}
    >
      {label != null && (
        <label htmlFor={id} className={labelVariants({ status })}>
          {label}
        </label>
      )}
      <div
        data-slot="text-field-field"
        data-status={status}
        className={cn(
          fieldVariants({ status, multiline }),
          disabled && "cursor-not-allowed opacity-50",
          fieldClassName,
        )}
      >
        {startIcon != null && (
          <span data-slot="text-field-icon" className="flex shrink-0 items-center self-start">
            {startIcon}
          </span>
        )}
        {control}
        {endIcon != null && (
          <span data-slot="text-field-icon" className="flex shrink-0 items-center self-start">
            {endIcon}
          </span>
        )}
      </div>
      {supportingText != null && (
        <p id={supportId} className={supportVariants({ status })}>
          {supportingText}
        </p>
      )}
    </div>
  );
}

export { TextField, fieldVariants as textFieldVariants };
