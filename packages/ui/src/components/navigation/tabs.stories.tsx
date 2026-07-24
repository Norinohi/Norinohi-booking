import { Tabs, TabsList, TabsPanel, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Navigation/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    variant: { control: "inline-radio", options: ["lined", "segmented"] },
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const labels = ["All Events", "Charters", "Reviews", "Crew"];

export const Lined: Story = {
  args: { variant: "lined" },
  render: (args) => (
    <Tabs {...args} defaultValue="0" className="w-[520px]">
      <TabsList>
        {labels.map((label, i) => (
          <TabsTab key={label} value={String(i)}>
            {label}
          </TabsTab>
        ))}
      </TabsList>
      {labels.map((label, i) => (
        <TabsPanel key={label} value={String(i)} className="text-sm text-foreground">
          {label} content
        </TabsPanel>
      ))}
    </Tabs>
  ),
};

export const Segmented: Story = {
  args: { variant: "segmented" },
  render: (args) => (
    <Tabs {...args} defaultValue="0">
      <TabsList>
        {labels.map((label, i) => (
          <TabsTab key={label} value={String(i)}>
            {label}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  ),
};

/** Segmented tabs stacked vertically — the Figma "Mobile Segmented" layout. */
export const MobileSegmented: Story = {
  parameters: { controls: { disable: true } },
  render: () => (
    <Tabs variant="segmented" orientation="vertical" defaultValue="0" className="w-[160px]">
      <TabsList>
        {labels.map((label, i) => (
          <TabsTab key={label} value={String(i)}>
            {label}
          </TabsTab>
        ))}
      </TabsList>
    </Tabs>
  ),
};
