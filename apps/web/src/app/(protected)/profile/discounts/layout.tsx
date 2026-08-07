/*
 * The discounts segment renders its page plus a parallel @modal slot: soft navigation to
 * /create, /[id]/edit or /prices/[id] is intercepted into the slot (dialog on md+, full-screen
 * takeover on mobile), while hard loads fall through to the standalone pages.
 */
export default function DiscountsLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
