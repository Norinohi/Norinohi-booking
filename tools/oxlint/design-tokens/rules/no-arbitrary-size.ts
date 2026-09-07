import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

/**
 * Lengths that ride the density dial. Every one of these Tailwind utilities resolves
 * through `--spacing`, which `--density` multiplies, so an arbitrary value written here
 * is a length frozen at density 1 while everything around it shrinks.
 */
const SPACING_UTILITIES = new Set([
  "p",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "ps",
  "pe",
  "m",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "ms",
  "me",
  "gap",
  "gap-x",
  "gap-y",
  "space-x",
  "space-y",
  "w",
  "h",
  "size",
  "min-w",
  "max-w",
  "min-h",
  "max-h",
  "basis",
  "top",
  "right",
  "bottom",
  "left",
  "start",
  "end",
  "inset",
  "inset-x",
  "inset-y",
  "scroll-m",
  "scroll-mt",
  "scroll-mb",
  "scroll-ml",
  "scroll-mr",
  "scroll-p",
  "scroll-pt",
  "scroll-pb",
  "translate-x",
  "translate-y",
  "leading",
]);

/** Font sizes ride `--density-type`, both the `text-h*` tokens and Tailwind's `--text-*` ramp. */
const TYPE_UTILITY = "text";

/**
 * `utility-[<number><unit>]` anywhere in a class string, variant prefixes included, so
 * `xl:max-w-[451px]` is caught as well as the bare form. The trailing `(?!:)` is what
 * keeps breakpoints out: `min-[1360px]:hidden` is a media query, not a length, and a
 * breakpoint must not scale. Values built with `calc()` never match, because the bracket
 * has to hold a bare number.
 */
const ARBITRARY = /(?<!\w)([a-z][a-z0-9-]*)-\[(\d+(?:\.\d+)?)(px|rem|em)\](?!:)/g;

const PX_PER_STEP = 4;
const PX_PER_REM = 16;

function toStep(value: number, unit: string): string | null {
  const px = unit === "px" ? value : unit === "rem" ? value * PX_PER_REM : null;
  if (px === null) return null;
  const step = px / PX_PER_STEP;
  return Number.isInteger(step) ? String(step) : String(Number(step.toFixed(4)));
}

export const noArbitrarySizeRule = defineRule({
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow arbitrary px/rem lengths and font sizes in class strings; they do not ride the density dial.",
    },
    messages: {
      arbitraryFontSize:
        "`{{cls}}` freezes a font size, so it ignores `--density-type`. Use a typography token (`text-h1`…`text-h6`, `text-body-*`), composing per breakpoint where the ramp differs: `text-h4 xl:text-h2`.",
      arbitrarySpacing:
        "`{{cls}}` freezes a length, so it ignores `--density`. Use the spacing scale: `{{suggestion}}`. Fractional steps are fine — 109px is `pt-27.25`.",
      arbitrarySpacingNoStep:
        "`{{cls}}` freezes a length, so it ignores `--density`. Express it on the spacing scale (`{{utility}}-<number>`) rather than in em.",
    },
  },
  create(context) {
    /** `raw` is the literal's own source text, which is where the class string lives. */
    const check = (node: ESTree.Node, raw: string) => {
      const seen = new Set<string>();
      for (const match of raw.matchAll(ARBITRARY)) {
        const [cls, utility, amount, unit] = match;
        // The pattern has three mandatory groups, so a match always fills all four slots.
        // The guard is what proves that to the compiler under `noUncheckedIndexedAccess`.
        if (!cls || !utility || !amount || !unit) continue;
        if (seen.has(cls)) continue;
        seen.add(cls);

        const value = Number(amount);

        if (utility === TYPE_UTILITY) {
          context.report({ node, messageId: "arbitraryFontSize", data: { cls } });
          continue;
        }
        if (!SPACING_UTILITIES.has(utility)) continue;

        const step = toStep(value, unit);
        if (step === null) {
          context.report({
            node,
            messageId: "arbitrarySpacingNoStep",
            data: { cls, utility },
          });
          continue;
        }
        context.report({
          node,
          messageId: "arbitrarySpacing",
          data: { cls, suggestion: `${utility}-${step}` },
        });
      }
    };

    return {
      Literal(node) {
        if (node.raw) check(node, node.raw);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
});
