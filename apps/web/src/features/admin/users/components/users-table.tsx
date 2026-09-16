"use client";

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
import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Search } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { useUsers } from "../hooks/use-users";
import type { UserAccountStatus, UserAdminSort, UserRole } from "../types";

/*
 * UsersTable — every account on the platform with how to reach it and how much it has booked.
 * Search comes first for the same reason as on the bookings list: staff arrive here with a name,
 * an address or a number from a phone call, not with a filter in mind.
 */

/* Same sentinel the other admin filters use: "" would blank the Select trigger. */
const ALL = "all";

const ROLES: readonly UserRole[] = ["customer", "staff", "admin"];
const STATUSES: readonly UserAccountStatus[] = ["active", "guest", "deactivated"];
const BOOKING_FILTERS = ["with", "without"] as const;
const SORTS: readonly UserAdminSort[] = ["newest", "mostBookings", "name"];

const STATUS_VARIANTS = {
  active: "success",
  guest: "warning",
  deactivated: "neutral",
} as const satisfies Record<UserAccountStatus, string>;

const COLUMN_COUNT = 6;
const SKELETON_ROWS = 8;
const SKELETON_WIDTHS = ["w-36", "w-44", "w-28", "w-16", "w-20", "w-20"];

export default function UsersTable() {
  const t = useTranslations("Admin.Users");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [bookings, setBookings] = useState(ALL);
  const [sort, setSort] = useState<string>("newest");
  const [page, setPage] = useState(1);

  /* Narrowed by lookup rather than asserted, like the bookings filters: ALL is in no list. */
  const selectedBookings = BOOKING_FILTERS.find((option) => option === bookings);

  const { data, isPending, isError } = useUsers({
    query: query.trim() || undefined,
    role: ROLES.find((option) => option === role),
    status: STATUSES.find((option) => option === status),
    hasBookings: selectedBookings ? selectedBookings === "with" : undefined,
    sort: SORTS.find((option) => option === sort),
    page,
  });

  const day = (value: string) => format.dateTime(new Date(value), { dateStyle: "short" });

  const onFilterChange = (set: (next: string) => void) => (next: string) => {
    set(next);
    setPage(1);
  };

  const messageRow = (message: string) => (
    <TableRow>
      <TableCell
        colSpan={COLUMN_COUNT}
        className="text-center text-sm font-medium text-natural-500"
      >
        {message}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col gap-4">
      <TextField
        containerClassName="min-w-0"
        fieldClassName="h-12"
        aria-label={t("filters.search")}
        startIcon={<Search />}
        placeholder={t("filters.search")}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Select
          className="h-12 min-w-0"
          ariaLabel={t("filters.role")}
          value={role}
          onValueChange={onFilterChange(setRole)}
          options={[
            { value: ALL, label: t("filters.allRoles") },
            ...ROLES.map((value) => ({ value, label: t(`role.${value}`) })),
          ]}
        />
        <Select
          className="h-12 min-w-0"
          ariaLabel={t("filters.status")}
          value={status}
          onValueChange={onFilterChange(setStatus)}
          options={[
            { value: ALL, label: t("filters.allStatuses") },
            ...STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
          ]}
        />
        <Select
          className="h-12 min-w-0"
          ariaLabel={t("filters.bookings")}
          value={bookings}
          onValueChange={onFilterChange(setBookings)}
          options={[
            { value: ALL, label: t("filters.anyBookings") },
            ...BOOKING_FILTERS.map((value) => ({ value, label: t(`filters.${value}Bookings`) })),
          ]}
        />
        <Select
          className="h-12 min-w-0"
          ariaLabel={t("filters.sort")}
          value={sort}
          onValueChange={onFilterChange(setSort)}
          options={SORTS.map((value) => ({ value, label: t(`sort.${value}`) }))}
        />
      </div>

      {data ? (
        <p className="text-sm font-medium text-natural-500">
          {t("total", { count: data.pagination.totalItems })}
        </p>
      ) : null}

      <Table className="min-w-225 [&_td]:py-3 [&_th]:h-12.5 [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.user")}</TableHead>
            <TableHead>{t("table.email")}</TableHead>
            <TableHead>{t("table.phone")}</TableHead>
            <TableHead>{t("table.bookings")}</TableHead>
            <TableHead>{t("table.lastBooking")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending
            ? Array.from({ length: SKELETON_ROWS }, (_, row) => (
                <TableRow key={row}>
                  {SKELETON_WIDTHS.map((width, column) => (
                    <TableCell key={column}>
                      <Skeleton className={`h-4 rounded-md ${width}`} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : isError
              ? messageRow(t("error"))
              : data.items.length === 0
                ? messageRow(t("empty"))
                : data.items.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell className="max-w-56">
                        <div className="flex flex-col">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate font-medium text-foreground">
                              {account.name ?? "-"}
                            </span>
                            {/* Only the roles that are not the default: a chip on every row would
                                be noise that hides the few accounts with staff access. */}
                            {account.role === "customer" ? null : (
                              <Chip variant="brand" className="shrink-0">
                                {t(`role.${account.role}`)}
                              </Chip>
                            )}
                          </span>
                          <span className="text-sm text-natural-500">
                            {t("createdAt", { at: day(account.createdAt) })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-60">
                        <div className="flex flex-col">
                          <a
                            href={`mailto:${account.email}`}
                            className="truncate text-foreground transition-colors hover:text-brand"
                          >
                            {account.email}
                          </a>
                          {account.emailVerified ? null : (
                            <span className="text-sm text-natural-500">{t("unverified")}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {account.phone ? (
                          <a
                            href={`tel:${account.phone.replace(/[^\d+]/g, "")}`}
                            className="text-foreground transition-colors hover:text-brand"
                          >
                            {account.phone}
                          </a>
                        ) : (
                          <span className="text-natural-500">-</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <span className="font-medium text-foreground">{account.bookingCount}</span>
                        {account.bookingCount > 0 ? (
                          <span className="block text-sm text-natural-500">
                            {t("confirmed", { count: account.confirmedBookingCount })}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {account.lastBookingAt ? (
                          day(account.lastBookingAt)
                        ) : (
                          <span className="text-natural-500">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip variant={STATUS_VARIANTS[account.status]}>
                          {t(`status.${account.status}`)}
                        </Chip>
                      </TableCell>
                    </TableRow>
                  ))}
        </TableBody>
      </Table>

      {data && data.pagination.totalPages > 1 ? (
        <div className="flex justify-center md:justify-start">
          <PaginationControl
            page={page}
            onPageChange={setPage}
            pageCount={data.pagination.totalPages}
            summary={false}
          />
        </div>
      ) : null}
    </div>
  );
}
