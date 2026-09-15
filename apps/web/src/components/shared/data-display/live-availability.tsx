"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

/*
 * Whether the charter the visitor has in front of them just priced live.
 *
 * The yacht page's status chip and its booking sidebar belong to two features, and the chip only
 * knew the projection's stored first charter. When that had lapsed between syncs the chip read "On
 * request" beside a sidebar that had quoted the chosen dates a moment earlier. The sidebar reports
 * a successful quote here and the chip reads it; neither feature imports the other.
 */
type LiveAvailability = { sellable: boolean; setSellable: (sellable: boolean) => void };

const LiveAvailabilityContext = createContext<LiveAvailability | null>(null);

export function LiveAvailabilityProvider({ children }: { children: ReactNode }) {
  const [sellable, setSellable] = useState(false);
  return (
    <LiveAvailabilityContext.Provider value={{ sellable, setSellable }}>
      {children}
    </LiveAvailabilityContext.Provider>
  );
}

/** True once a live quote for the shown dates has succeeded. False outside a provider. */
export function useLiveSellable(): boolean {
  return useContext(LiveAvailabilityContext)?.sellable ?? false;
}

/** Reports the reporter's current answer, and withdraws it when the reporter unmounts. */
export function useReportLiveSellable(sellable: boolean) {
  const setSellable = useContext(LiveAvailabilityContext)?.setSellable;

  useEffect(() => {
    if (!setSellable) return;
    setSellable(sellable);
    return () => setSellable(false);
  }, [sellable, setSellable]);
}
