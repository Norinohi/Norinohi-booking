// Auth screens keep the nav but drop the global footer (Figma "Sign In").
// `contents` leaves the page layout untouched; `[&~footer]:hidden` hides the
// root-layout <Footer/> sibling — same pattern as the map/plan-my-trip layouts.
export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <div className="contents [&~footer]:hidden">{children}</div>;
}
