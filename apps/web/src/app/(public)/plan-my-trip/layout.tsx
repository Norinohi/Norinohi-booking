export default function PlanMyTripLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-brand-50 [&~footer]:hidden">{children}</div>;
}
