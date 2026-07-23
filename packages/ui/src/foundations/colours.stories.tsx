import type { Meta, StoryObj } from "@storybook/react-vite";

/*
 * Design-system colour foundations — sourced from the Figma "Colors" page.
 * Ramps render straight from the primitive CSS vars; semantic surfaces use the
 * Tailwind utilities mapped in globals.css so they follow light/dark.
 */
const RAMPS = [
  { name: "brand / primary", prefix: "brand" },
  { name: "brand / secondary", prefix: "brand-secondary" },
  { name: "natural", prefix: "natural" },
  { name: "error", prefix: "error" },
  { name: "positive", prefix: "positive" },
  { name: "warning", prefix: "warning" },
];

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];

const SEMANTIC = [
  "bg-background",
  "bg-card",
  "bg-primary",
  "bg-secondary",
  "bg-muted",
  "bg-accent",
  "bg-brand",
  "bg-destructive",
];

const meta = {
  title: "Foundations/Colours",
  parameters: { layout: "fullscreen", controls: { disable: true } },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ramps: Story = {
  render: () => (
    <div className="w-full max-w-4xl space-y-8">
      {RAMPS.map((ramp) => (
        <div key={ramp.prefix} className="space-y-2">
          <p className="text-body-s text-muted-foreground">{ramp.name}</p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {STEPS.map((step) => (
              <div key={step} className="space-y-1">
                <div
                  className="h-14 rounded-md border border-border"
                  style={{ backgroundColor: `var(--${ramp.prefix}-${step})` }}
                />
                <p className="text-center text-body-caption-s text-muted-foreground">{step}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  ),
};

export const SemanticSurfaces: Story = {
  render: () => (
    <div className="grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
      {SEMANTIC.map((cls) => (
        <div key={cls} className={`flex h-20 items-end rounded-lg border border-border p-2 ${cls}`}>
          <span className="rounded bg-background/70 px-1 text-body-caption-s text-foreground">
            {cls}
          </span>
        </div>
      ))}
    </div>
  ),
};
