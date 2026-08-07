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
        // Selection is drawn with an inset ring (box-shadow), not a border, so switching states
        // changes no layout at all — padding stays constant and the option text can never re-wrap
        // or shift. Default: 1px neutral ring; selected: 2px brand ring + tint.
        "flex w-[414px] max-w-full cursor-pointer flex-col gap-1.5 rounded-lg p-5 text-left ring-inset outline-none transition-[background-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring/40",
        selected
          ? "bg-brand-50 ring-2 ring-brand"
          : "bg-card ring-1 ring-border hover:bg-natural-50",
        className,
      )}
      {...props}
    >
      <span className="flex items-center gap-2.5 text-xl leading-[1.3] font-bold text-foreground">
        {flag && <span aria-hidden>{flag}</span>}
        {title}
      </span>
      {description && (
        <span className="text-base leading-[1.4] text-natural-500">{description}</span>
      )}
    </button>
  );
}

export { QuizCard };
