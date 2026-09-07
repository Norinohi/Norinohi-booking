"use client";

import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useUiLabels } from "@yacht-charter/ui/components/ui-labels";

/*
 * Breadcrumb — Figma "Breadcrumbs" (node 811-169083).
 * 16px Manrope, gap 4px. Links/separator = caption grey (#a0a0a0 / natural-300),
 * current page = bold foreground.
 */
function Breadcrumb(props: React.ComponentProps<"nav">) {
  const labels = useUiLabels();
  return <nav aria-label={labels.breadcrumb} data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1 text-base leading-[1.4] break-words",
        className,
      )}
      {...props}
    />
  );
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  );
}

/**
 * `render` takes the router's own link, the way `Button` does.
 *
 * A bare `<a href="/yachts">` in a localised app is a link out of the reader's locale: the
 * middleware answers it with a redirect to the default one, so a Ukrainian visitor lands in
 * English. The app passes its `Link`, which prefixes the locale and keeps the navigation client
 * side; the plain anchor stays the default for a crumb pointing somewhere else entirely.
 */
function BreadcrumbLink({ className, render, ...props }: useRender.ComponentProps<"a">) {
  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "cursor-pointer text-natural-300 transition-colors hover:text-foreground",
          className,
        ),
      },
      props,
    ),
    render,
    state: { slot: "breadcrumb-link" },
  });
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("font-bold text-foreground", className)}
      {...props}
    />
  );
}

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("text-natural-300", className)}
      {...props}
    >
      {children ?? "/"}
    </li>
  );
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
};
