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
import Link from "next/link";
import { type ComponentProps, Fragment } from "react";

type Href = ComponentProps<typeof Link>["href"];

/** `name` is a message key, or the literal label when `dynamic` is set. */
export type AppBreadcrumb = {
  name: string;
  url?: string;
  dynamic?: boolean;
};

type AppBreadcrumbsProps = {
  items: AppBreadcrumb[];
  /** Message key for the back button; omit it (or `backHref`) to drop the button. */
  backLabel?: string;
  backHref?: Href;
  className?: string;
};

export default function AppBreadcrumbs({
  items,
  backLabel,
  backHref,
  className,
}: AppBreadcrumbsProps) {
  const t = useTranslations();

  /* next-intl types `t` against the whole message tree; a runtime key can only reach it via a cast. */
  type Key = Parameters<typeof t>[0];
  const translate = (key: string) => t(key as Key);
  const label = (crumb: AppBreadcrumb) => (crumb.dynamic ? crumb.name : translate(crumb.name));

  return (
    <div className={cn("border-b border-natural-50 px-4 py-3 md:px-13.5", className)}>
      <div className="mx-auto flex max-w-349 items-center gap-5">
        {backLabel && backHref ? (
          <Button
            variant="subtle"
            size="sm"
            nativeButton={false}
            render={<Link href={backHref} />}
          >
            <ArrowLeft />
            {translate(backLabel)}
          </Button>
        ) : null}

        <Breadcrumb>
          <BreadcrumbList>
            {items.map((crumb, index) => {
              const isLast = index === items.length - 1;

              return (
                <Fragment key={`${crumb.name}-${index}`}>
                  <BreadcrumbItem>
                    {isLast || !crumb.url ? (
                      <BreadcrumbPage>{label(crumb)}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={crumb.url}>{label(crumb)}</BreadcrumbLink>
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
