import { Select, type SelectOption } from "@yacht-charter/ui/components/form/select";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MapPin } from "lucide-react";
import { useState } from "react";

const OPTIONS: SelectOption[] = [
  { value: "catamaran", label: "Catamaran" },
  { value: "sailing-yacht", label: "Sailing yacht" },
  { value: "motor-yacht", label: "Motor yacht" },
  { value: "gulet", label: "Gulet" },
];

const meta = {
  title: "Form/Select",
  component: Select,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { options: OPTIONS, placeholder: "Any boat", value: null, onValueChange: () => {} },
  render: function Render(args) {
    /* `null` rather than `undefined`, so the select is controlled from the first render. */
    const [value, setValue] = useState<string | null>(args.value ?? null);
    return (
      <div className="w-[240px]">
        <Select {...args} value={value} onValueChange={setValue} />
      </div>
    );
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithIcon: Story = {
  args: {
    icon: <MapPin className="size-6 shrink-0 text-foreground" />,
    placeholder: "Where to?",
  },
};

/** Skeleton rows while options are being fetched — the popup never shows a bare empty list. */
export const Loading: Story = {
  args: { isLoading: true },
};

/** When the resolved list is empty, a muted `emptyLabel` (a prop — this package has no i18n). */
export const Empty: Story = {
  args: { options: [], emptyLabel: "No boats found" },
};

/**
 * `clearable` layers a reset button over the trigger. It defaults to `false` — a single select
 * usually must hold a value — so the caller decides what "cleared" means via `onClear`.
 */
export const Clearable: Story = {
  render: function Render() {
    const [value, setValue] = useState<string | undefined>("sailing-yacht");
    return (
      <div className="w-[240px]">
        <Select
          options={OPTIONS}
          placeholder="Any boat"
          value={value}
          onValueChange={setValue}
          clearable={value !== undefined}
          clearLabel="Clear selection"
          onClear={() => setValue(undefined)}
        />
      </div>
    );
  },
};

export const Disabled: Story = {
  args: { disabled: true },
};
