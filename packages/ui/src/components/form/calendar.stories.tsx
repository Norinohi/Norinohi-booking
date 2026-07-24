import { Calendar, type DateRange } from "@yacht-charter/ui/components/form/calendar";
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

// Fixed month keeps the stories deterministic across renders.
const MARCH_2024 = new Date(2024, 2, 1);

const meta = {
  title: "Form/Calendar",
  component: Calendar,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  argTypes: {
    mode: {
      control: "inline-radio",
      options: ["single", "range"],
      description: "single = one day · range = start/end with a filled middle bar.",
    },
    weekStartsOn: {
      control: "select",
      options: [0, 1],
      description: "0 = Sunday (default), 1 = Monday.",
    },
  },
  args: { mode: "single", defaultMonth: MARCH_2024 },
} satisfies Meta<typeof Calendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const SingleSelect: Story = {
  name: "Single day select",
  render: () => (
    <Calendar mode="single" defaultMonth={MARCH_2024} defaultSelected={new Date(2024, 2, 14)} />
  ),
};

export const RangeSelect: Story = {
  name: "Multiple day select",
  render: () => (
    <Calendar
      mode="range"
      defaultMonth={MARCH_2024}
      defaultSelected={{ from: new Date(2024, 2, 10), to: new Date(2024, 2, 20) }}
    />
  ),
};

export const WeekStartsMonday: Story = {
  name: "Week starts Monday",
  render: () => (
    <Calendar
      mode="single"
      defaultMonth={MARCH_2024}
      weekStartsOn={1}
      defaultSelected={new Date(2024, 2, 14)}
    />
  ),
};

export const DisabledDays: Story = {
  name: "Disabled days",
  parameters: { controls: { disable: true } },
  render: () => (
    // Disable weekends.
    <Calendar
      mode="single"
      defaultMonth={MARCH_2024}
      defaultSelected={new Date(2024, 2, 14)}
      disabled={(date) => date.getDay() === 0 || date.getDay() === 6}
    />
  ),
};

export const Controlled: Story = {
  name: "Controlled range",
  parameters: { controls: { disable: true } },
  render: () => {
    const [range, setRange] = React.useState<DateRange | undefined>({
      from: new Date(2024, 2, 10),
      to: undefined,
    });
    const fmt = (date: Date | undefined) => (date ? date.toLocaleDateString() : "—");
    return (
      <div className="flex flex-col items-center gap-3">
        <Calendar mode="range" defaultMonth={MARCH_2024} selected={range} onSelect={setRange} />
        <p className="text-body-s text-muted-foreground">
          {fmt(range?.from)} → {fmt(range?.to)}
        </p>
      </div>
    );
  },
};

export const Overview: Story = {
  name: "Single & range",
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-wrap items-start gap-6">
      <Calendar mode="single" defaultMonth={MARCH_2024} defaultSelected={new Date(2024, 2, 2)} />
      <Calendar
        mode="range"
        defaultMonth={MARCH_2024}
        defaultSelected={{ from: new Date(2024, 2, 2), to: new Date(2024, 2, 15) }}
      />
    </div>
  ),
};
