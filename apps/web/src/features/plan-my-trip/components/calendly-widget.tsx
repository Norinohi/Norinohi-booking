"use client";

import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import Script from "next/script";
import { useEffect, useState } from "react";

// Backstop in case Calendly never posts a message (script blocked, API change) —
// the skeleton shouldn't sit forever over an iframe that's actually ready.
const LOADED_FALLBACK_MS = 6000;

/** Inline Calendly booking embed — loads Calendly's widget script and mounts the iframe. */
export function CalendlyWidget({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Calendly posts `{ event: "calendly.event_type_viewed", ... }` once the embed has
    // actually rendered, well after the iframe itself starts loading.
    function onMessage(event: MessageEvent) {
      if (typeof event.data?.event === "string" && event.data.event.startsWith("calendly.")) {
        setLoaded(true);
      }
    }
    window.addEventListener("message", onMessage);
    const fallback = setTimeout(() => setLoaded(true), LOADED_FALLBACK_MS);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(fallback);
    };
  }, []);

  return (
    <div className="relative h-[700px] w-full">
      {!loaded && <Skeleton className="absolute inset-0 rounded-2xl" />}
      <div className="calendly-inline-widget h-full w-full" data-url={url} />
      <Script src="https://assets.calendly.com/assets/external/widget.js" strategy="lazyOnload" />
    </div>
  );
}
