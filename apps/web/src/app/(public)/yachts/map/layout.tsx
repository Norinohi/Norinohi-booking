/* A nested layout cannot remove an ancestor's footer, but it is a DOM sibling of it. */
export default function YachtsMapLayout({ children }: { children: React.ReactNode }) {
  return <div className="contents [&~footer]:hidden">{children}</div>;
}
