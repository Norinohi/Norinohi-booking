"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { DateRange } from "@yacht-charter/ui/components/form/calendar";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useQueryStates } from "nuqs";

import Sidebar from "@/components/layout/sidebar";
import DatePicker from "@/components/shared/form/date-picker";
import EmptyState from "@/components/shared/feedback/empty-state";
import Loader from "@/components/shared/feedback/loader";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { authClient } from "@/lib/auth-client";
import { dayFromNative, dayToNative } from "@/lib/date";

import { bookingListQueryOptions } from "../api/queries";
import { useBookingCards } from "../hooks/use-booking-cards";
import { bookingSearchParsers } from "../lib/bookings-search-params";
import BookingCard from "./booking-card";

/*
 * BookingsScreen — the /profile/bookings layout: a "← Home" breadcrumb, then the account Sidebar
 * beside a "History" panel. The panel is a titled header (History + a date-range filter) over the
 * booking list and its pager, or the "No yachts yet" empty state. The list is `booking.list`; the
 * card is the shared BoatCard, so the boat spec sheet it shows is still placeholder data (see
 * useBookingCards) until the backend adds those fields. Filter + page live in the URL (nuqs).
 * Figma "My bookings" (972:54737).
 */

export default function BookingsScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Bookings");
  const router = useRouter();
  const { toBookingCard } = useBookingCards();
  const [{ from, to, page }, setParams] = useQueryStates(bookingSearchParsers);

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  const { data, isLoading } = useQuery({
    ...bookingListQueryOptions({ page, from: from ?? undefined, to: to ?? undefined }),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;

  const range: DateRange | undefined =
    from || to ? { from: dayToNative(from), to: dayToNative(to) } : undefined;

  const onRangeChange = (next: DateRange | undefined) => {
    setParams({
      from: next?.from ? dayFromNative(next.from) : null,
      to: next?.to ? dayFromNative(next.to) : null,
      page: 1,
    });
  };

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
                onValueChange={onRangeChange}
                placeholder={t("anyDates")}
                clearLabel={t("clearDates")}
                hugContent
                className="w-full sm:w-auto sm:min-w-[200px]"
              />
            </div>

            {isLoading ? (
              <div className="flex justify-center p-10">
                <Loader />
              </div>
            ) : items.length ? (
              <>
                <div className="flex flex-col gap-4 p-4 md:p-5">
                  {items.map((booking, index) => (
                    <BookingCard
                      key={booking.id}
                      {...toBookingCard(booking)}
                      priority={index === 0}
                    />
                  ))}
                </div>
                {totalPages > 1 ? (
                  <div className="flex justify-center border-t border-natural-100 px-5 py-5 xl:justify-start">
                    <PaginationControl
                      page={page}
                      onPageChange={(next) => setParams({ page: next })}
                      pageCount={totalPages}
                      summary={false}
                    />
                  </div>
                ) : null}
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
