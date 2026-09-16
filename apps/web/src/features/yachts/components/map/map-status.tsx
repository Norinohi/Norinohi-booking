"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import type { ReactNode } from "react";

export interface MapStatusProps {
  children: ReactNode;
  /** Offered where the message is a failure worth trying again. */
  onRetry?: () => void;
  retryLabel?: string;
}

/** A one-line notice over the map: loading, nothing found, or a request that failed. */
export default function MapStatus({ children, onRetry, retryLabel }: MapStatusProps) {
  return (
    <div
      role="status"
      className="absolute inset-x-3 top-28 mx-auto w-fit max-w-full rounded-xl bg-card p-3 text-center text-sm shadow-md md:top-auto md:bottom-24"
    >
      {children}
      {onRetry && (
        <Button variant="subtle" size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
