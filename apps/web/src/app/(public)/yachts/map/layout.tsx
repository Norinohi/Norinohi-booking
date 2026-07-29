/*
 * The map owns the viewport, so this route drops the global footer. A nested layout
 * cannot remove what an ancestor rendered, but it *is* a sibling of it inside the root
 * grid — hence the sibling selector. `contents` keeps this wrapper out of the layout
 * itself, so the screen below stays the grid's `1fr` row.
 */
export default function YachtsMapLayout({ children }: { children: React.ReactNode }) {
  return <div className="contents [&~footer]:hidden">{children}</div>;
}
