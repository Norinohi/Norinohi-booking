import { definePlugin } from "@oxlint/plugins";

import { noArbitrarySizeRule } from "./rules/no-arbitrary-size.ts";

/**
 * Rules that keep the layout on its design tokens. Separate from the vendored `anti-slop`
 * plugin on purpose: that one is hash-locked and must not be edited, this one is ours.
 */
const designTokensPlugin = definePlugin({
  meta: { name: "design-tokens" },
  rules: {
    "no-arbitrary-size": noArbitrarySizeRule,
  },
});

export default designTokensPlugin;
