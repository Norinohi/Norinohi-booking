"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@yacht-charter/ui/components/overlay/tooltip";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Info } from "lucide-react";
import * as React from "react";
import {
  Controller,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
  FormProvider,
  useFormContext,
  useFormState,
} from "react-hook-form";

/*
 * Form — the react-hook-form composition layer, in the shadcn shape.
 * `FormItem` mints one id and wires label ⇄ control ⇄ message through aria; `FormControl`
 * clones those attributes onto whatever single child it wraps, so any control works
 * (`TextField`, `Select`, `Checkbox`, …) as long as it forwards unknown props to its input.
 *
 * `FormControl` sets `aria-invalid` — controls should paint their error state off
 * `[aria-invalid="true"]` rather than a `status` prop, so nothing has to be threaded by hand.
 *
 * There is no Radix `Slot` here: base-ui uses `render` props instead, so `FormControl` clones
 * its child directly. Child props win, matching Slot's precedence.
 */
const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = { name: TName };

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

type FormItemContextValue = { id: string };

const FormItemContext = React.createContext<FormItemContextValue | null>(null);

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  const value = React.useMemo<FormFieldContextValue>(() => ({ name: props.name }), [props.name]);

  return (
    <FormFieldContext.Provider value={value}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

function useFormField() {
  const fieldContext = React.use(FormFieldContext);
  const itemContext = React.use(FormItemContext);
  const { getFieldState } = useFormContext();

  if (!fieldContext) throw new Error("useFormField should be used within <FormField>");
  if (!itemContext) throw new Error("useFormField should be used within <FormItem>");

  /* Scoped to this field, so only this item re-renders when its own error changes. */
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);
  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

function FormItem({ className, ...props }: React.ComponentProps<"div">) {
  const id = React.useId();
  const value = React.useMemo(() => ({ id }), [id]);

  return (
    <FormItemContext.Provider value={value}>
      <div data-slot="form-item" className={cn("grid gap-1.5", className)} {...props} />
    </FormItemContext.Provider>
  );
}

function FormLabel({
  className,
  tooltip,
  children,
  ...props
}: React.ComponentProps<"label"> & {
  /** Renders an info icon beside the label that explains the field on hover. */
  tooltip?: React.ReactNode;
}) {
  const { error, formItemId } = useFormField();

  return (
    <div className="inline-flex items-center gap-2">
      <label
        data-slot="form-label"
        data-error={error ? "true" : undefined}
        htmlFor={formItemId}
        className={cn(
          "text-sm leading-[1.2] font-semibold tracking-[0.02em] text-foreground select-none",
          "data-[error=true]:text-error-500",
          className,
        )}
        {...props}
      >
        {children}
      </label>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={typeof children === "string" ? children : undefined}
                className="flex cursor-pointer items-center text-natural-500 outline-none focus-visible:text-brand"
              />
            }
          >
            <Info className="size-4" />
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

/** The attributes `FormControl` writes onto its child, and the only ones it reads back. */
type FormControlAttributes = Pick<React.AriaAttributes, "aria-describedby" | "aria-invalid"> & {
  id?: string;
};

function FormControl({ children }: { children: React.ReactElement<FormControlAttributes> }) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  /* No `data-slot` here — a control spreads unknown props onto its inner input, so setting one
   * would overwrite the slot the control marks itself with. */
  return React.cloneElement(children, {
    id: formItemId,
    "aria-describedby": error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId,
    "aria-invalid": error ? true : undefined,
    ...children.props,
  });
}

function FormDescription({ className, ...props }: React.ComponentProps<"p">) {
  const { formDescriptionId } = useFormField();

  return (
    <p
      data-slot="form-description"
      id={formDescriptionId}
      className={cn("text-xs leading-[1.2] tracking-[0.02em] text-natural-500", className)}
      {...props}
    />
  );
}

function FormMessage({ className, children, ...props }: React.ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error.message ?? "") : children;

  if (!body) return null;

  return (
    <p
      data-slot="form-message"
      id={formMessageId}
      className={cn("text-xs leading-[1.2] tracking-[0.02em] text-error-500", className)}
      {...props}
    >
      {body}
    </p>
  );
}

export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
};
