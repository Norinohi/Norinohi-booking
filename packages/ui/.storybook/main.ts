import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)", "../src/**/*.mdx"],
  addons: ["@storybook/addon-docs", "@storybook/addon-themes"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
  async viteFinal(viteConfig) {
    // Resolve the package self-alias the same way tsconfig/exports do,
    // so stories can import "@yacht-charter/ui/components/...".
    viteConfig.resolve ??= {};
    viteConfig.resolve.alias = {
      ...viteConfig.resolve.alias,
      "@yacht-charter/ui": fileURLToPath(new URL("../src", import.meta.url)),
    };
    return viteConfig;
  },
};

export default config;
