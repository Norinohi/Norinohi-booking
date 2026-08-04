export default function YachtsMapLayout({ children }: { children: React.ReactNode }) {
  return <div className="contents [&~footer]:hidden">{children}</div>;
}
