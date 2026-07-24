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
    // Keep a single React copy. Base UI ships one entry per subpath, so a subpath
    // discovered late (e.g. scroll-area) gets its own dep-optimizer pass and pulls
    // in a second React, breaking hooks with "Cannot read properties of null
    // (reading 'useId')". Pre-bundling every subpath we use in one pass — plus
    // deduping react/react-dom — pins them all to the same React instance.
    viteConfig.resolve.dedupe = [...(viteConfig.resolve.dedupe ?? []), "react", "react-dom"];
    viteConfig.optimizeDeps ??= {};
    viteConfig.optimizeDeps.include = [
      ...(viteConfig.optimizeDeps.include ?? []),
      "@base-ui/react/checkbox",
      "@base-ui/react/radio",
      "@base-ui/react/radio-group",
      "@base-ui/react/switch",
      "@base-ui/react/slider",
      "@base-ui/react/select",
      "@base-ui/react/scroll-area",
      "@base-ui/react/tabs",
    ];
    return viteConfig;
  },
};

export default config;
