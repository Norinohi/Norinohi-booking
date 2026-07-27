import { cn } from "@yacht-charter/ui/lib/utils";

/*
 * QuizCard — Figma "card-quiz" (626:4616), states default / checked. A selectable option
 * card: flag + title + description, turning brand-50 with a brand border when selected.
 */
type QuizCardProps = Omit<React.ComponentProps<"button">, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  flag?: React.ReactNode;
  selected?: boolean;
};

function QuizCard({
  title,
  description,
  flag,
  selected = false,
  className,
  ...props
}: QuizCardProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-selected={selected || undefined}
      className={cn(
        "flex w-[414px] max-w-full flex-col gap-1.5 rounded-xl border p-4 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
        selected ? "border-brand bg-brand-50" : "border-border bg-card hover:bg-natural-50",
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-2 text-lg font-semibold text-foreground">
        {flag && <span aria-hidden>{flag}</span>}
        {title}
      </span>
      {description && (
        <span className="text-base leading-relaxed text-natural-600">{description}</span>
      )}
    </button>
  );
}

export { QuizCard };
