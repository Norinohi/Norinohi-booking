import { StepIndicator } from "@yacht-charter/ui/components/navigation/step-indicator";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Navigation/Step Indicator",
  component: StepIndicator,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    total: { control: { type: "number", min: 1, max: 12 } },
    current: { control: { type: "number", min: 0, max: 12 } },
    label: { control: "boolean" },
  },
  args: { total: 6, current: 2, label: true },
  decorators: [
    (Story) => (
      <div className="w-[560px] max-w-full">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof StepIndicator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const AllSteps: Story = {
  name: "All steps",
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex w-full flex-col gap-8">
      {Array.from({ length: 6 }, (_, i) => (
        <StepIndicator key={i} total={6} current={i + 1} />
      ))}
    </div>
  ),
};

export const WithoutLabel: Story = {
  name: "Without label",
  args: { current: 3, label: false },
};

export const CustomLabel: Story = {
  name: "Custom label",
  parameters: { controls: { disable: true } },
  render: () => (
    <StepIndicator
      total={4}
      current={2}
      label={(current, total) => `${current} / ${total} · Details`}
    />
  ),
};
