import { withThemeByClassName } from "@storybook/addon-themes";
import type { Preview } from "@storybook/react-vite";

import "../src/styles/globals.css";

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
    // Our theme owns the surface colour; disable Storybook's own backgrounds.
    backgrounds: { disable: true },
  },
  decorators: [
    // Toggle the `.dark` class (matches globals.css `@custom-variant dark`).
    withThemeByClassName({
      themes: { light: "", dark: "dark" },
      defaultTheme: "light",
    }),
    // Paint the canvas with the theme surface so bg/text follow light/dark.
    (Story) => (
      <div className="bg-background text-foreground flex min-h-40 items-center justify-center p-10">
        <Story />
      </div>
    ),
  ],
};

export default preview;
