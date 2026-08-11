// Auth screens keep the nav but drop the global footer (Figma "Sign In"). The opt-out lives in the
// root layout's <FooterGate> (keyed off the pathname), so this layout only carries the route config.
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
