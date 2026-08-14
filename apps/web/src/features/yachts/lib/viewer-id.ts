const STORAGE_KEY = "yc.viewer-id";

/**
 * A random per-browser id, used for one thing: keeping one visitor from counting as
 * several in "N people viewed today". It is not an analytics identity — the server
 * hashes it with the date before storing, so it links nothing across days. A visitor
 * who clears storage gets a new id and can be counted a second time; that is the
 * accepted ceiling on how accurate a public view counter can be.
 *
 * Returns null wherever storage is unavailable (SSR, private-mode failures, a
 * visitor who has blocked it). The caller skips the count rather than falling back
 * to a fingerprint of any kind.
 */
export function viewerId(): string | null {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;

    const minted = crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, minted);
    return minted;
  } catch {
    return null;
  }
}
