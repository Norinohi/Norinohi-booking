/*
 * The discounts segment renders its page plus a parallel @modal slot: soft navigation to
 * /create, /[id]/edit or /prices/[id] is intercepted into the slot (dialog on md+, full-screen
 * takeover on mobile), while hard loads fall through to the standalone pages.
 */
// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function DiscountsLayout(
  {
    children,
    modal,
  }: {
    children: React.ReactNode;
    modal: React.ReactNode;
  }
) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
