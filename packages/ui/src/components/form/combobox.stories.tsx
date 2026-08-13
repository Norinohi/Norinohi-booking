import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxSearch,
  ComboboxTrigger,
} from "@yacht-charter/ui/components/form/combobox";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Anchor, Globe, Map as MapIcon, MapPin } from "lucide-react";
import { type ReactNode, useState } from "react";

type Destination = { label: string; kind: "country" | "region" | "location" | "base" };

const DESTINATIONS: Destination[] = [
  { label: "Croatia", kind: "country" },
  { label: "Greece", kind: "country" },
  { label: "Italy", kind: "country" },
  { label: "Dalmatia", kind: "region" },
  { label: "Amalfi Coast", kind: "region" },
  { label: "Dubrovnik", kind: "location" },
  { label: "Split", kind: "location" },
  { label: "ACI Marina Dubrovnik", kind: "base" },
  { label: "ACI Marina Split", kind: "base" },
  { label: "Alimos Marina", kind: "base" },
];

const KIND_ICON = {
  country: <Globe className="size-5 shrink-0 text-natural-400" />,
  region: <MapIcon className="size-5 shrink-0 text-natural-400" />,
  location: <MapPin className="size-5 shrink-0 text-natural-400" />,
  base: <Anchor className="size-5 shrink-0 text-natural-400" />,
} satisfies Record<Destination["kind"], ReactNode>;

const meta = {
  title: "Form/Combobox",
  component: Combobox,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof meta>;

/*
 * Single-select searchable dropdown: the trigger opens a popup whose search field filters the list.
 * The stories own the value since the component is controlled. Base-ui filters this static list; the
 * app instead feeds server suggestions and passes `filter={null}` to show them as provided.
 */
function Demo({ initial = null }: { initial?: Destination | null }) {
  const [value, setValue] = useState<Destination | null>(initial);
  return (
    <div className="flex w-[330px] flex-col gap-1.5">
      <span className="text-sm font-semibold">Location</span>
      <Combobox
        items={DESTINATIONS}
        value={value}
        onValueChange={(next: Destination | null) => setValue(next)}
        itemToStringLabel={(item: Destination) => item.label}
      >
        <ComboboxTrigger
          icon={<MapPin className="size-6 shrink-0 text-foreground" />}
          onClear={value ? () => setValue(null) : undefined}
          clearLabel="Clear location"
        >
          {value ? value.label : <span className="text-placeholder-foreground">Location</span>}
        </ComboboxTrigger>
        <ComboboxContent>
          <ComboboxSearch placeholder="Search destinations…" />
          <ComboboxEmpty>No matching destinations</ComboboxEmpty>
          <ComboboxList>
            {(item: Destination) => (
              <ComboboxItem key={item.label} value={item}>
                {KIND_ICON[item.kind]}
                <span className="truncate">{item.label}</span>
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <span className="text-xs text-natural-500">value: {value?.label ?? "—"}</span>
    </div>
  );
}

/** Empty selection shows the placeholder; the popup search filters the list. */
export const Default: Story = {
  render: () => <Demo />,
};

/** With a selection the trigger shows the chosen destination. */
export const WithSelection: Story = {
  render: () => <Demo initial={{ label: "Dubrovnik", kind: "location" }} />,
};
