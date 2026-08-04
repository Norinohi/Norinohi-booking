export type SearchCursor = {
  value: string | number;
  listingId: string;
};

export function encodeSearchCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeSearchCursor(value: string | undefined): SearchCursor | undefined {
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<SearchCursor>;
    if (!parsed.listingId || parsed.value === undefined) return undefined;
    return { listingId: parsed.listingId, value: parsed.value };
  } catch {
    return undefined;
  }
}
