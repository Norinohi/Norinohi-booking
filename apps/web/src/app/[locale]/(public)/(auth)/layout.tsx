// Auth screens keep the nav but drop the global footer (Figma "Sign In").
// `contents` leaves the page layout untouched; `[&~footer]:hidden` hides the
// root-layout <Footer/> sibling — same pattern as the map/plan-my-trip layouts.
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="contents [&~footer]:hidden">{children}</div>;
}
