import {
  MultiSelect,
  type MultiSelectOption,
} from "@yacht-charter/ui/components/form/multi-select";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MapPin, Sailboat } from "lucide-react";
import { useState } from "react";

const BOATS: MultiSelectOption[] = [
  { value: "sailing-yacht", label: "Sailing Yacht" },
  { value: "catamaran", label: "Catamaran" },
  { value: "gulet", label: "Gulet" },
  { value: "motor-yacht", label: "Motor Yacht" },
  { value: "power-catamaran", label: "Power Catamaran" },
  { value: "sailboat", label: "Sailboat" },
  { value: "motor-boat", label: "Motor Boat" },
];

const COUNTRIES: MultiSelectOption[] = [
  { value: "egypt", label: "Egypt" },
  { value: "morocco", label: "Morocco" },
  { value: "croatia", label: "Croatia" },
  { value: "spain", label: "Spain" },
  { value: "france", label: "France" },
  { value: "italy", label: "Italy" },
  { value: "portugal", label: "Portugal" },
  { value: "greece", label: "Greece" },
  { value: "norway", label: "Norway" },
  { value: "turkey", label: "Turkey" },
  { value: "montenegro", label: "Montenegro" },
];

const meta = {
  title: "Form/MultiSelect",
  component: MultiSelect,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { options: BOATS, value: [], onValueChange: () => {}, placeholder: "All boats" },
} satisfies Meta<typeof MultiSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Stateful wrapper — the component is controlled, so the stories own the value. */
function Demo({
  label,
  initial = [],
  ...props
}: Omit<React.ComponentProps<typeof MultiSelect>, "value" | "onValueChange"> & {
  label: string;
  initial?: string[];
}) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <div className="flex w-[330px] flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      <MultiSelect value={value} onValueChange={setValue} {...props} />
      <span className="text-xs text-natural-500">value: [{value.join(", ")}]</span>
    </div>
  );
}

/** Empty selection means "no constraint", so the trigger shows the placeholder. */
export const Default: Story = {
  render: () => <Demo label="Boat type" options={BOATS} placeholder="All boats" />,
};

/** With a selection the trigger lists the chosen labels. */
export const WithSelection: Story = {
  render: () => (
    <Demo
      label="Boat type"
      options={BOATS}
      placeholder="All boats"
      initial={["catamaran", "gulet"]}
    />
  ),
};

/** `searchPlaceholder` mounts the in-popup filter field — for long lists. */
export const Searchable: Story = {
  render: () => (
    <Demo
      label="Country"
      options={COUNTRIES}
      placeholder="All countries"
      searchPlaceholder="Search Countries..."
      initial={["croatia", "italy"]}
    />
  ),
};

/** The search bar variant: a leading icon inside the trigger. */
export const WithIcon: Story = {
  render: () => (
    <div className="flex gap-4">
      <Demo
        label="Location"
        options={COUNTRIES}
        placeholder="Location"
        searchPlaceholder="Search Countries..."
        icon={<MapPin className="size-6 shrink-0 text-foreground" />}
      />
      <Demo
        label="Boat type"
        options={BOATS}
        placeholder="Any boat"
        icon={<Sailboat className="size-6 shrink-0 text-foreground" />}
      />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <Demo label="Boat type" options={BOATS} placeholder="All boats" initial={["gulet"]} disabled />
  ),
};
