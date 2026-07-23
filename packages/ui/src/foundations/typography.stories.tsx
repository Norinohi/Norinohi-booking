import type { Meta, StoryObj } from "@storybook/react-vite";

/*
 * Typography foundations — Figma "Typography" page (Manrope).
 * Named type-scale classes defined in globals.css (@layer components), responsive
 * mobile → ≥768px.
 */
const TYPE = [
  "text-h1",
  "text-h2",
  "text-h3",
  "text-h4",
  "text-h5",
  "text-h6",
  "text-body-xl",
  "text-body-m",
  "text-body-m-bold",
  "text-body-s",
  "text-body-caption",
  "text-body-caption-s",
  "text-input-button",
  "text-input-title",
  "text-input-helper",
];

const meta = {
  title: "Foundations/Typography",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Scale: Story = {
  render: () => (
    <div className="w-full max-w-3xl space-y-3">
      {TYPE.map((cls) => (
        <div key={cls} className="flex items-baseline gap-4 border-b border-border pb-3">
          <span className="w-40 shrink-0 text-body-s text-muted-foreground">{cls}</span>
          <span className={cls}>Sail the Adriatic</span>
        </div>
      ))}
    </div>
  ),
};
