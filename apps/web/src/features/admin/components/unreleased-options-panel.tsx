"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@yacht-charter/ui/components/data-display/table";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRetryRelease, useUnreleasedOptions } from "../hooks/use-maintenance";

/*
 * UnreleasedOptionsPanel — weeks a vendor is still holding against us, on /sync.
 *
 * Beside the reliability table because it answers the same kind of question: not what one
 * booking is doing, but what the connection has left behind. Our own row already says
 * cancelled, so nothing on the bookings screen is wrong; the slot is simply still blocked
 * upstream and sells to nobody until the vendor lets go.
 *
 * The hold expiry is the column that decides whether a row matters. A vendor option lapses on
 * its own, so a refused release is urgent until then and moot afterwards, and a list that did
 * not say so would have staff telephoning about weeks that freed themselves weeks ago.
 */

export default function UnreleasedOptionsPanel() {
  const t = useTranslations("Admin.Sync.unreleasedOptions");
  const format = useFormatter();
  const { data, isPending } = useUnreleasedOptions();
  const retry = useRetryRelease();

  const items = data?.items ?? [];
  const now = Date.now();

  const askAgain = (bookingId: string, reference: string) => {
    retry.mutate(
      { bookingId },
      {
        onSuccess: (result) => {
          if (result.released) {
            toast.success(t("released", { reference }));
            return;
          }
          /* The vendor's own words. A second refusal is the answer, not a failure of the
             screen, and it is what support quotes back at the operator. */
          toast.warning(result.reason ?? t("refusedAgain", { reference }));
        },
        onError: () => toast.error(t("retryFailed", { reference })),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base leading-[1.3] font-bold text-foreground">{t("title")}</h2>
        <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("subtitle")}</p>
      </div>

      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : items.length === 0 ? (
        <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("reference")}</TableHead>
                <TableHead>{t("provider")}</TableHead>
                <TableHead>{t("optionId")}</TableHead>
                <TableHead>{t("hold")}</TableHead>
                <TableHead>{t("refusedAt")}</TableHead>
                <TableHead>{t("reason")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const lapsed =
                  item.holdExpiresAt !== null && new Date(item.holdExpiresAt).getTime() <= now;

                return (
                  <TableRow key={item.bookingId}>
                    <TableCell className="font-semibold">{item.reference}</TableCell>
                    <TableCell>{item.provider}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.providerOptionId ?? "-"}
                    </TableCell>
                    <TableCell>
                      {item.holdExpiresAt === null ? (
                        t("holdUnknown")
                      ) : (
                        <Chip variant={lapsed ? "neutral" : "warning"}>
                          {lapsed
                            ? t("lapsed")
                            : t("holdsUntil", {
                                when: format.dateTime(new Date(item.holdExpiresAt), "dayShort"),
                              })}
                        </Chip>
                      )}
                    </TableCell>
                    <TableCell>{format.dateTime(new Date(item.failedAt), "dayShort")}</TableCell>
                    <TableCell className="max-w-80 text-sm wrap-break-word">
                      {item.reason}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="neutral"
                        size="sm"
                        loading={retry.isPending}
                        onClick={() => askAgain(item.bookingId, item.reference)}
                      >
                        {t("retry")}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
