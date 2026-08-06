"use client";

import type { DateRange } from "@yacht-charter/ui/components/form/calendar";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import Sidebar from "@/components/layout/sidebar";
import DatePicker from "@/components/shared/form/date-picker";
import EmptyState from "@/components/shared/feedback/empty-state";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { useBoatCards } from "@/hooks/use-boat-cards";
import { authClient } from "@/lib/auth-client";

import { SAMPLE_BOOKINGS } from "../lib/bookings";
import BookingCard from "./booking-card";

/*
 * BookingsScreen — the /profile/bookings layout: a "← Home" breadcrumb, then the account Sidebar
 * beside a "History" panel (stacked below lg, per the Figma tablet/mobile frames). The panel is a
 * titled header (History + a date-range filter) over the booking list and its pager, or the
 * "No yachts yet" empty state when there are none. Figma "My bookings" (972:54737 desktop,
 * 973:81652 tablet, 973:81719 mobile).
 */

const PAGE_COUNT = 15;

export default function BookingsScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Bookings");
  const router = useRouter();
  const { toSearchCard } = useBoatCards();
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [page, setPage] = useState(1);

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  const bookings = SAMPLE_BOOKINGS.map(toSearchCard);

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="px-4 py-6 md:px-13.5">
        <div className="mx-auto grid max-w-349 gap-5 lg:grid-cols-[334px_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            defaultActive="bookings"
            onLogout={logout}
            className="max-w-none"
          />

          <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
            <div className="flex flex-wrap items-center justify-between gap-5 border-b border-natural-100 p-4 md:p-5">
              <h2 className="text-lg leading-[1.3] font-bold text-foreground md:text-xl">
                {t("history")}
              </h2>
              {/* Hug-content per Figma: 200px empty, growing with the picked range (~249px). */}
              <DatePicker
                mode="range"
                value={range}
                onValueChange={setRange}
                placeholder={t("anyDates")}
                clearLabel={t("clearDates")}
                hugContent
                className="w-full sm:w-auto sm:min-w-[200px]"
              />
            </div>

            {bookings.length ? (
              <>
                <div className="flex flex-col gap-4 p-4 md:p-5">
                  {bookings.map((booking, index) => (
                    <BookingCard key={booking.id} {...booking} priority={index === 0} />
                  ))}
                </div>
                <div className="flex justify-center border-t border-natural-100 px-5 py-5 xl:justify-start">
                  <PaginationControl
                    page={page}
                    onPageChange={setPage}
                    pageCount={PAGE_COUNT}
                    summary={false}
                  />
                </div>
              </>
            ) : (
              <EmptyState title={t("emptyTitle")} description={t("emptyDescription")} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
