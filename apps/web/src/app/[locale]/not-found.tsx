import { Button } from "@yacht-charter/ui/components/actions/button";
import { useTranslations } from "next-intl";

import EmptyState from "@/components/shared/feedback/empty-state";
import { Link } from "@/i18n/navigation";

/*
 * Rendered for `notFound()` anywhere under `[locale]`, and for unmatched URLs via the `[...rest]`
 * catch-all. A Server Component: the locale was set by the layout, so `useTranslations` resolves
 * without a request-time read and the page stays prerenderable.
 */
export default function NotFound() {
  const t = useTranslations("Common.notFound");

  return (
    <main className="mx-auto flex w-full max-w-3xl items-center px-4 py-16 md:py-24">
      <EmptyState
        title={t("title")}
        description={t("description")}
        action={
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="brand" nativeButton={false} render={<Link href="/" />}>
              {t("home")}
            </Button>
            <Button variant="neutral" nativeButton={false} render={<Link href="/yachts" />}>
              {t("browse")}
            </Button>
          </div>
        }
      />
    </main>
  );
}
