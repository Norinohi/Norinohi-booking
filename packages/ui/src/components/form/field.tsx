"use client";

import { Field as FieldPrimitive } from "@base-ui/react/field";
import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * Field — Figma "Text field/ Label" + control pairing (node 985:73160).
 * Label is Manrope SemiBold 14 / 1.2, 0.02em tracking, 6px above the control.
 * Wraps base-ui Field so the label associates with whatever control sits inside
 * (Select, Slider, Checkbox…) without hand-wiring ids per field.
 */
function Field({
  label,
  description,
  className,
  labelClassName,
  children,
  ...props
}: FieldPrimitive.Root.Props & {
  label?: React.ReactNode;
  description?: React.ReactNode;
  labelClassName?: string;
}) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      className={cn("flex w-full flex-col items-start gap-1.5", className)}
      {...props}
    >
      {label != null && (
        <FieldPrimitive.Label
          className={cn(
            "text-sm font-semibold leading-[1.2] tracking-[0.02em] text-foreground capitalize",
            labelClassName,
          )}
        >
          {label}
        </FieldPrimitive.Label>
      )}
      {children}
      {description != null && (
        <FieldPrimitive.Description className="text-xs leading-[1.2] tracking-[0.02em] text-natural-500">
          {description}
        </FieldPrimitive.Description>
      )}
    </FieldPrimitive.Root>
  );
}

export { Field };
