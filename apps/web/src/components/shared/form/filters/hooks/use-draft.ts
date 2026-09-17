"use client";

import { type Dispatch, type SetStateAction, useState } from "react";

/**
 * Local edits that only leave on an explicit apply, while still following the
 * applied value when it changes elsewhere — the search bar, the filters panel and
 * the chips row all write to the same state, so a stale draft would silently undo
 * another surface's change on the next apply.
 */
export function useDraft<T>(applied: T): [T, Dispatch<SetStateAction<T>>] {
  const [draft, setDraft] = useState<T>(applied);
  const [seen, setSeen] = useState<T>(applied);

  /*
   * Compared by content, not by reference. The applied value is rebuilt whenever the facet
   * query refetches, because the range defaults are folded into it, and a reference check read
   * every refetch as somebody else's change: a duration picked in the panel but not yet applied
   * vanished a moment later. Filter state is a handful of scalars and short arrays.
   */
  if (seen !== applied && JSON.stringify(seen) !== JSON.stringify(applied)) {
    setSeen(applied);
    setDraft(applied);
  }

  return [draft, setDraft];
}
