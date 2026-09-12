import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@yacht-charter/ui/components/navigation/breadcrumb";
import { cn } from "@yacht-charter/ui/lib/utils";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Fragment, type ReactElement } from "react";

/** `name` is a message key, or the literal label when `dynamic` is set. */
export type AppBreadcrumb = {
  name: string;
  url?: string;
  dynamic?: boolean;
  /**
   * Renders the crumb's link, for a destination only the client knows — a remembered search, say.
   * Given one, `url` is ignored and the element receives the crumb's own label and styling.
   */
  render?: ReactElement;
};

interface AppBreadcrumbsProps {
  items: AppBreadcrumb[];
  /** Message key for the back button; omit it (or `backHref`) to drop the button. */
  backLabel?: string;
  /** ICU values for `backLabel`, when the label interpolates something. */
  backValues?: Record<string, string | number>;
  /** Plain string, like `AppBreadcrumb.url` — `typedRoutes` can only check a literal at the `Link` itself. */
  backHref?: string;
  /** Renders the back button's link instead of a plain `Link` to `backHref`; see `AppBreadcrumb.render`. */
  backRender?: ReactElement;
  className?: string;
}

export default function AppBreadcrumbs({
  items,
  backLabel,
  backValues,
  backHref,
  backRender,
  className,
}: AppBreadcrumbsProps) {
  const t = useTranslations();

  type Key = Parameters<typeof t>[0];
  /* SAFETY: next-intl types `t` against the whole message tree, so a key assembled at runtime
     (a crumb names its own message) can only reach it as an asserted key. */
  const translate = (key: string, values?: Record<string, string | number>) =>
    t(key as Key, values);
  const label = (crumb: AppBreadcrumb) => (crumb.dynamic ? crumb.name : translate(crumb.name));

  return (
    <div className={cn("border-b border-natural-50", className)}>
      <div className="mx-auto flex w-full max-w-384 items-center gap-5 px-4 py-3 md:px-13.5 xl:px-17.5">
        {backLabel && backHref ? (
          <Button
            variant="subtle"
            size="sm"
            className="h-auto min-h-8 min-w-0 max-w-full shrink py-1.5 whitespace-normal"
            nativeButton={false}
            render={backRender ?? <Link href={backHref} />}
          >
            <ArrowLeft />
            <span className="min-w-0 wrap-break-word">{translate(backLabel, backValues)}</span>
          </Button>
        ) : null}

        <Breadcrumb>
          <BreadcrumbList>
            {items.map((crumb, index) => {
              const isLast = index === items.length - 1;

              return (
                <Fragment key={`${crumb.name}-${index}`}>
                  <BreadcrumbItem>
                    {isLast || !(crumb.url || crumb.render) ? (
                      <BreadcrumbPage>{label(crumb)}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink render={crumb.render ?? <Link href={crumb.url ?? "/"} />}>
                        {label(crumb)}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {isLast ? null : <BreadcrumbSeparator />}
                </Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  );
}
