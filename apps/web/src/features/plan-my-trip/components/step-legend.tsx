/*
 * StepLegend — the question + helper line at the top of every planner step (Figma "Legend",
 * node 626:4275). H4 heading over Body-xl subtitle, 16px apart. Only the heading is required.
 */
export function StepLegend({
  title,
  subtitle,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-h4 text-foreground">{title}</h2>
      {subtitle && <p className="text-body-xl text-natural-600">{subtitle}</p>}
    </div>
  );
}
