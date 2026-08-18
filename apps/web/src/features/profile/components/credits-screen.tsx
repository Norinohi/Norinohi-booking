"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@yacht-charter/ui/components/data-display/table";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { cn } from "@yacht-charter/ui/lib/utils";
import { useFormatter, useTranslations } from "next-intl";
import { parseAsInteger, useQueryState } from "nuqs";

import Sidebar from "@/components/layout/sidebar";
import EmptyState from "@/components/shared/feedback/empty-state";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { useMoney } from "@/hooks/use-money";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";
import { dayToDisplay } from "@/lib/date";

import { useCreditBalance, useCreditLedger } from "../hooks/use-credits";
import { creditKindVariant } from "../lib/credits";

/*
 * CreditsScreen — /profile/credits, the account menu's "Credits & Balance".
 *
 * The balance is not a stored number: the server sums the unexpired ledger rows, so the table
 * below is the whole explanation of the figure above it and the two can never disagree. Earned
 * credit carries a deadline and spent credit does not, which is why the expiry column is blank
 * on half the rows rather than missing from the table.
 */

/** Matches the referral history table: 20px sides, 50px rows, 16px text at 1.4. */
const cellClass = "h-[50px] py-0 leading-[1.4] whitespace-nowrap";

export default function CreditsScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Credits");
  const router = useRouter();
  const format = useFormatter();
  const money = useMoney();
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));

  const { data: balance } = useCreditBalance();
  const { data: ledger, isPending } = useCreditLedger(page);

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  const totalPages = ledger?.pagination.totalPages ?? 1;

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="px-4 py-6 md:px-13.5">
        <div className="mx-auto grid max-w-349 gap-5 lg:grid-cols-[334px_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            defaultActive="credits"
            onLogout={logout}
            className="max-w-none"
          />

          <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
            <div className="border-b border-natural-100 p-4 md:p-5">
              <h2 className="text-xl leading-[1.3] font-bold text-foreground">{t("title")}</h2>
            </div>

            <div className="flex flex-col gap-4 p-4 md:p-5">
              <div className="flex flex-col gap-1 rounded-2xl bg-brand-50 p-4 md:p-8">
                <p className="text-sm leading-4.5 font-medium text-natural-600">
                  {t("balance.label")}
                </p>
                {balance ? (
                  <p className="text-[32px] leading-9 font-bold text-brand">
                    {money(balance.balance.amountMinor)}
                  </p>
                ) : (
                  <Skeleton className="h-9 w-40" />
                )}
                {/* Only worth a line when something is actually about to lapse. */}
                {balance && balance.expiringSoon.amountMinor > 0 ? (
                  <p className="text-sm leading-4.5 font-medium text-warning-600">
                    {t("balance.expiringSoon", {
                      amount: money(balance.expiringSoon.amountMinor),
                    })}
                  </p>
                ) : null}
                <p className="text-sm leading-4.5 font-medium text-natural-600">
                  {t("balance.hint")}
                </p>
              </div>

              <h3 className="text-base leading-[1.4] font-semibold text-foreground">
                {t("ledger.title")}
              </h3>

              {isPending ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((row) => (
                    <Skeleton key={row} className="h-[50px] w-full rounded-sm" />
                  ))}
                </div>
              ) : ledger && ledger.items.length > 0 ? (
                <>
                  <Table>
                    <TableBody>
                      {ledger.items.map((row) => (
                        <TableRow key={row.id} className="last:[&>td]:border-b-0">
                          <TableCell className={`w-1/4 min-w-[160px] ${cellClass}`}>
                            <Chip variant={creditKindVariant(row.kind)}>
                              {t(`ledger.kind.${row.kind}`)}
                            </Chip>
                          </TableCell>
                          <TableCell className={`w-1/4 min-w-[110px] ${cellClass}`}>
                            {format.dateTime(dayToDisplay(row.createdAt.slice(0, 10)), "dayShort")}
                          </TableCell>
                          {/* Blank where there is no deadline: spending never expires. */}
                          <TableCell
                            className={`w-1/4 min-w-[110px] text-natural-600 ${cellClass}`}
                          >
                            {row.expiresAt
                              ? t("ledger.expires", {
                                  date: format.dateTime(
                                    dayToDisplay(row.expiresAt.slice(0, 10)),
                                    "dayShort",
                                  ),
                                })
                              : null}
                          </TableCell>
                          {/* The sign is the whole story of a ledger row, so it is never dropped. */}
                          <TableCell
                            className={cn(
                              "w-1/4 min-w-[110px] font-bold",
                              cellClass,
                              row.amount.amountMinor < 0 ? "text-natural-600" : "text-positive-600",
                            )}
                          >
                            {row.amount.amountMinor < 0
                              ? `-${money(Math.abs(row.amount.amountMinor))}`
                              : `+${money(row.amount.amountMinor)}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {totalPages > 1 ? (
                    <div className="flex justify-center xl:justify-start">
                      <PaginationControl
                        page={page}
                        onPageChange={(next) => void setPage(next)}
                        pageCount={totalPages}
                        summary={false}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  title={t("ledger.emptyTitle")}
                  description={t("ledger.emptyDescription")}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
