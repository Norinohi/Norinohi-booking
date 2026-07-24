import { ScrollArea } from "@yacht-charter/ui/components/layout/scroll-area";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Layout/Scroll Area",
  component: ScrollArea,
  tags: ["autodocs"],
  parameters: { layout: "centered" },
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-[200px] w-[280px] rounded-lg border border-input">
      <div className="flex flex-col gap-4 p-4 pr-6">
        {Array.from({ length: 12 }, (_, i) => (
          <p key={i} className="text-sm font-semibold capitalize">
            Placeholder
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
};

/** Longer prose to show the natural-900 thumb travelling the natural-50 track. */
export const Paragraphs: Story = {
  render: () => (
    <ScrollArea className="h-[220px] w-[320px] rounded-lg border border-input">
      <div className="flex flex-col gap-3 p-4 pr-6 text-sm leading-relaxed text-foreground">
        {Array.from({ length: 8 }, (_, i) => (
          <p key={i}>
            Charter the coast at your own pace — the scrollbar keeps a 4px natural-50 track with a
            natural-900 thumb, exactly as the Figma "Scroll Bar" component specifies.
          </p>
        ))}
      </div>
    </ScrollArea>
  ),
};
