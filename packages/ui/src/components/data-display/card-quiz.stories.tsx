import { QuizCard } from "@yacht-charter/ui/components/data-display/card-quiz";
import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

const DESCRIPTION =
  "Best for scenic routes & cultural mix. Sail through iconic islands with crystal-clear water, historic towns, and a balance of adventure and comfort.";

const meta = {
  title: "Data Display/Cards/Quiz",
  component: QuizCard,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
  args: { flag: "🇬🇷", title: "Greece", description: DESCRIPTION, selected: false },
} satisfies Meta<typeof QuizCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Selected: Story = { args: { selected: true } };

export const States: Story = {
  name: "Default / checked",
  parameters: { controls: { disable: true } },
  render: () => (
    <div className="flex flex-col gap-4">
      <QuizCard flag="🇬🇷" title="Greece" description={DESCRIPTION} />
      <QuizCard flag="🇬🇷" title="Greece" description={DESCRIPTION} selected />
    </div>
  ),
};

export const Interactive: Story = {
  parameters: { controls: { disable: true } },
  render: () => {
    const options = ["Greece", "Croatia", "Italy"] as const;
    const flags = { Greece: "🇬🇷", Croatia: "🇭🇷", Italy: "🇮🇹" };
    const [picked, setPicked] = React.useState("Greece");
    return (
      <div className="flex flex-col gap-4">
        {options.map((name) => (
          <QuizCard
            key={name}
            flag={flags[name]}
            title={name}
            description={DESCRIPTION}
            selected={picked === name}
            onClick={() => setPicked(name)}
          />
        ))}
      </div>
    );
  },
};
