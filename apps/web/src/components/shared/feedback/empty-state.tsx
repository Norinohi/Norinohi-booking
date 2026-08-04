import { cn } from "@yacht-charter/ui/lib/utils";
import type { ReactNode } from "react";

import { Image } from "@/components/shared/data-display/image";

export type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Replaces the default artwork; pass `null` to drop it. */
  illustration?: ReactNode;
  action?: ReactNode;
  className?: string;
};

export default function EmptyState({
  title,
  description,
  illustration,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-4 rounded-2xl bg-card px-5 py-6 md:px-17.5",
        className,
      )}
    >
      {illustration === undefined ? (
        <Image
          src="/assets/illustrations/no-results.svg"
          alt=""
          width={128}
          height={131}
          unoptimized
        />
      ) : (
        illustration
      )}

      <h3 className="text-center text-xl font-semibold leading-[1.1] text-black md:text-2xl">
        {title}
      </h3>

      {description ? (
        <p className="text-center text-sm font-medium leading-[1.3] text-natural-500">
          {description}
        </p>
      ) : null}

      {action}
    </div>
  );
}
