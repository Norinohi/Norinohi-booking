export default function PlanMyTripLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col bg-brand-50 [&~footer]:hidden">{children}</div>;
}
