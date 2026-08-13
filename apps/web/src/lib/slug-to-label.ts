export const slugToLabel = (slug: string) =>
  slug.replace(/[-_]/g, " ").replace(/^./, (char) => char.toUpperCase());
