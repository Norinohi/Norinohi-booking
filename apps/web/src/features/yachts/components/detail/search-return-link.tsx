"use client";

import { type ComponentProps, useEffect, useState } from "react";

import { type AppPathname, Link } from "@/i18n/navigation";

import { lastSearchHref, SEARCH_FALLBACK_HREF } from "../../lib/last-search";

interface SearchReturnLinkProps extends Omit<ComponentProps<typeof Link>, "href"> {}

/**
 * A link back to the search the visitor came from, filters and all.
 *
 * Rendered by the breadcrumbs through their `render` slot, so the button and the crumb keep the
 * look they already have and only the destination changes.
 *
 * The remembered search is read after mount rather than during render: this sits in the detail
 * page's prerendered shell, which has no session storage to read, and a first paint that
 * disagreed with the markup is a hydration mismatch. Until the effect runs the link is the bare
 * catalogue, which is where it pointed before this existed.
 */
export default function SearchReturnLink(props: SearchReturnLinkProps) {
  const [href, setHref] = useState(SEARCH_FALLBACK_HREF);

  useEffect(() => {
    setHref(lastSearchHref());
  }, []);

  /* SAFETY: the stored value is a path this app minted, but typedRoutes can only check a
     literal, and a remembered one is only known at runtime. */
  return <Link {...props} href={href as AppPathname} />;
}
