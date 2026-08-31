"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@yacht-charter/ui/components/data-display/table";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { useTranslations } from "next-intl";

import { useMoney } from "@/hooks/use-money";

import { useReferralHistory } from "../hooks/use-referrals";
import { daysSince, referralStatusVariant } from "../lib/referrals";

/*
 * ReferralsHistory — the "Referral History" table of /profile/referrals.
 * Figma "My Referrals" section 3: 972:55009 (desktop, inside 972:54801) /
 * 973:88651 (tablet) / 973:88718 (mobile). Table instance 972:55013.
 * No header row; 4 equal-width columns (flex 1, min-w 110 / 160 for the chip
 * column), 50px rows, last row drops the bottom divider. Mobile keeps all four
 * columns and scrolls horizontally (973:90533 + Scroll Bar 973:90633), which the
 * Table container already provides.
 */

/** Every design cell: 20px side padding, 50px row, 16px text at 1.4 line-height. */
const cellClass = "h-[50px] py-0 leading-[1.4] whitespace-nowrap";

export default function ReferralsHistory() {
  const t = useTranslations("Referrals");
  const formatMoney = useMoney();
  const { data, isPending } = useReferralHistory();

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base leading-[1.4] font-semibold text-foreground">
        {t("history.title")}
      </h3>

      {isPending ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-[50px] w-full rounded-sm" />
          ))}
        </div>
      ) : data && data.items.length > 0 ? (
        <Table>
          <TableBody>
            {data.items.map((row) => (
              <TableRow key={row.id} className="last:[&>td]:border-b-0">
                <TableCell className={`w-1/4 min-w-[110px] font-medium ${cellClass}`}>
                  {row.referredUserName}
                </TableCell>
                {/* "0 days ago" reads wrong for a referral accepted today. */}
                <TableCell className={`w-1/4 min-w-[110px] ${cellClass}`}>
                  {daysSince(row.createdAt) === 0
                    ? t("history.today")
                    : t("history.daysAgo", { count: daysSince(row.createdAt) })}
                </TableCell>
                <TableCell className={`w-1/4 min-w-[160px] ${cellClass}`}>
                  <Chip variant={referralStatusVariant(row.status)}>
                    {t(`history.${row.status}`)}
                  </Chip>
                </TableCell>
                {/* Amount stays blank while pending — nothing has been credited yet. */}
                <TableCell className={`w-1/4 min-w-[110px] font-bold ${cellClass}`}>
                  {row.amount ? formatMoney(row.amount.amountMinor, row.amount.currency) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p className="text-body-m text-natural-600">{t("history.empty")}</p>
      )}
    </div>
  );
}
