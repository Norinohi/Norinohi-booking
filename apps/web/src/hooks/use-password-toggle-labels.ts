import { useTranslations } from "next-intl";

/*
 * Translated aria-labels for TextField's password reveal toggle. TextField lives in
 * packages/ui and has no access to next-intl, so every password field passes them in.
 */
export function usePasswordToggleLabels() {
  const t = useTranslations("Common.passwordToggle");
  return { showPasswordLabel: t("show"), hidePasswordLabel: t("hide") };
}
