import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@yacht-charter/ui/components/form/form";
import {
  SelectRoot,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { TooltipProvider } from "@yacht-charter/ui/components/overlay/tooltip";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

/*
 * The stories validate with react-hook-form's own `rules` rather than a schema, to keep the
 * primitive's story free of a validation-library dependency — `FormField` takes whatever
 * `Controller` takes.
 */
type Values = { fullName: string; email: string; crew: string };

const DEFAULTS: Values = { fullName: "", email: "", crew: "" };

const CREW = new Map([
  ["fullCrew", "Full crew"],
  ["skipperOptional", "Skipper optional"],
]);

/* Annotated rather than `satisfies`: `Form` is `FormProvider`, whose props are the whole
 * `useForm` return, so `satisfies` would demand them as story args. Every story builds its
 * own form in `render` instead. */
const meta: Meta<typeof Form> = {
  title: "Form/Form",
  component: Form,
  tags: ["autodocs"],
  parameters: { layout: "centered", controls: { disable: true } },
  decorators: [
    (Story) => (
      <TooltipProvider delay={0}>
        <div className="w-[420px]">
          <Story />
        </div>
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof meta>;

function NameField() {
  return (
    <FormField
      name="fullName"
      rules={{ required: "Enter your full name", minLength: { value: 2, message: "Too short" } }}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Full Name</FormLabel>
          <FormControl>
            <TextField placeholder="John Doe" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function EmailField() {
  return (
    <FormField
      name="email"
      rules={{
        required: "Enter an email address",
        pattern: { value: /.+@.+\..+/, message: "Enter a valid email address" },
      }}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Email Address</FormLabel>
          <FormControl>
            <TextField type="email" placeholder="name@example.com" {...field} />
          </FormControl>
          <FormDescription>We only use it to confirm the booking.</FormDescription>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/** The everyday shape: label, control, description, message, submit. */
export const Default: Story = {
  render: function Render() {
    const form = useForm<Values>({ defaultValues: DEFAULTS, mode: "onTouched" });

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(() => {})} className="flex flex-col gap-6">
          <NameField />
          <EmailField />
          <Button type="submit" className="w-full">
            Continue
          </Button>
        </form>
      </Form>
    );
  },
};

/** Errors are triggered on mount, so the red label, border and message are all visible. */
export const WithErrors: Story = {
  render: function Render() {
    const form = useForm<Values>({ defaultValues: { ...DEFAULTS, email: "not-an-email" } });

    useEffect(() => {
      void form.trigger();
    }, [form]);

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(() => {})} className="flex flex-col gap-6">
          <NameField />
          <EmailField />
          <Button type="submit" className="w-full">
            Continue
          </Button>
        </form>
      </Form>
    );
  },
};

/** `FormLabel` takes a `tooltip`, for fields that need a sentence of explanation. */
export const WithTooltip: Story = {
  render: function Render() {
    const form = useForm<Values>({ defaultValues: DEFAULTS });

    return (
      <Form {...form}>
        <FormField
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel tooltip="As printed in the passport you will show at the base.">
                Full Name
              </FormLabel>
              <FormControl>
                <TextField placeholder="John Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    );
  },
};

/**
 * `FormControl` clones its aria attributes onto whatever single child it wraps, so any control
 * works — here a Select instead of a text field.
 */
export const WithSelect: Story = {
  render: function Render() {
    const form = useForm<Values>({ defaultValues: DEFAULTS, mode: "onTouched" });

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(() => {})} className="flex flex-col gap-6">
          <FormField
            name="crew"
            rules={{ required: "Pick a crew option" }}
            render={({ field }) => (
              <FormItem>
                <FormLabel>Crew</FormLabel>
                <SelectRoot value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Placeholder">
                        {() => CREW.get(field.value) ?? "Placeholder"}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="fullCrew">{CREW.get("fullCrew")}</SelectItem>
                    <SelectItem value="skipperOptional">{CREW.get("skipperOptional")}</SelectItem>
                  </SelectContent>
                </SelectRoot>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full">
            Continue
          </Button>
        </form>
      </Form>
    );
  },
};
