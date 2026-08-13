import { z } from "zod";

import { isBrowser } from "@/utils/runtime";

const STORAGE_KEY = "yc.wishlist.v1";
/* Matches wishlistMergeInputSchema.max(50) so a merge never trips input validation. */
const MAX_ITEMS = 50;
/* `storage` only fires in other tabs — this covers our own. */
const SAME_TAB_EVENT = "yc:wishlist";

const EMPTY: readonly string[] = Object.freeze([]);

type Listener = () => void;

const listeners = new Set<Listener>();

/*
 * getSnapshot must hand back a stable reference or useSyncExternalStore re-renders
 * forever, so the parsed array is cached and only rebuilt when the raw string changed.
 */
let cachedRaw: string | null = null;
let cachedIds: readonly string[] = EMPTY;

/* Set when localStorage throws (private mode, blocked context, quota): degrade to memory. */
let memoryFallback: readonly string[] | null = null;

/*
 * Whatever sits under the key was written by an older build or hand-edited: keep the entries
 * that still read as ids and drop the rest, rather than throwing the whole list away.
 */
const storedIdsSchema = z
  .array(z.string().min(1).nullable().catch(null))
  .catch([])
  .transform((entries) => entries.filter((entry) => entry !== null));

function storage(): Storage | null {
  if (!isBrowser) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function normalize(ids: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (id.length === 0) continue;
    seen.add(id);
    if (seen.size >= MAX_ITEMS) break;
  }

  return seen.size === 0 ? EMPTY : Object.freeze([...seen]);
}

function notify() {
  for (const listener of listeners) listener();
}

export function read(): readonly string[] {
  if (memoryFallback) return memoryFallback;

  const store = storage();
  if (!store) return EMPTY;

  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }

  if (raw === cachedRaw) return cachedIds;

  cachedRaw = raw;
  if (raw === null) {
    cachedIds = EMPTY;
    return cachedIds;
  }

  try {
    cachedIds = normalize(storedIdsSchema.parse(JSON.parse(raw)));
  } catch {
    cachedIds = EMPTY;
    try {
      store.removeItem(STORAGE_KEY);
      cachedRaw = null;
    } catch {
      /* ignore */
    }
  }

  return cachedIds;
}

export function write(ids: readonly string[]): void {
  const next = normalize(ids);
  const store = storage();

  if (store) {
    try {
      const raw = JSON.stringify(next);
      store.setItem(STORAGE_KEY, raw);
      cachedRaw = raw;
      cachedIds = next;
      memoryFallback = null;
    } catch {
      memoryFallback = next;
    }
  } else if (isBrowser) {
    memoryFallback = next;
  }

  if (isBrowser) {
    window.dispatchEvent(new Event(SAME_TAB_EVENT));
  }
  notify();
}

/** Prepends, so the guest list is newest-first like wishlist.list. */
export function add(listingId: string): void {
  const current = read();
  if (current[0] === listingId) return;
  write([listingId, ...current.filter((id) => id !== listingId)]);
}

export function remove(listingId: string): void {
  const current = read();
  if (!current.includes(listingId)) return;
  write(current.filter((id) => id !== listingId));
}

export function has(listingId: string): boolean {
  return read().includes(listingId);
}

/** Drops only what was merged, so a save made in another tab mid-merge survives. */
export function removeMany(listingIds: readonly string[]): void {
  const drop = new Set(listingIds);
  const current = read();
  const next = current.filter((id) => !drop.has(id));
  if (next.length === current.length) return;
  write(next);
}

export function clear(): void {
  const store = storage();
  if (store) {
    try {
      store.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  cachedRaw = null;
  cachedIds = EMPTY;
  memoryFallback = null;

  if (isBrowser) {
    window.dispatchEvent(new Event(SAME_TAB_EVENT));
  }
  notify();
}

export function subscribe(onStoreChange: Listener): () => void {
  listeners.add(onStoreChange);

  const onStorage = (event: StorageEvent) => {
    /* null key is another tab's storage.clear(). */
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    cachedRaw = null;
    onStoreChange();
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(SAME_TAB_EVENT, onStoreChange);

  return () => {
    listeners.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SAME_TAB_EVENT, onStoreChange);
  };
}

export const getSnapshot = read;

/*
 * SSR and the first client render both see EMPTY so the markup matches; React swaps
 * in the real ids after hydration. Keeps bookmark buttons free of mismatch warnings
 * without a mounted flag at every call site.
 */
export function getServerSnapshot(): readonly string[] {
  return EMPTY;
}

export { MAX_ITEMS, STORAGE_KEY };
