"use client";

import { IconButton } from "@yacht-charter/ui/components/actions/icon-button";
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
import { Search, SquarePen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { useMoney } from "@/hooks/use-money";

import { useListingPriceFilters, useListingPrices } from "../hooks/use-discounts";
import type { ListingPriceRow } from "../types";

/*
 * ManagePricesTable — the "Manage Prices" tab of /profile/discounts: search + type/location
 * filters over the provider listings, the price table and its pager.
 * Figma "Discount & Price Manager / Manage Prices": desktop 972:55440 / tablet 973:103838 /
 * mobile 973:103902.
 * Filter row (48px controls, 16px gaps): search flexes, selects 222px on desktop; below md
 * the search goes full-width with the selects splitting a row underneath. Select options come
 * from `admin.listingPrice.filters`; rows from `admin.listingPrice.list`, with the search
 * text debounced before it hits the query. Table: five equal columns (`table-fixed`, min
 * 960px per tablet metadata so narrow screens scroll), header on natural-50, 50px header /
 * 52px rows; Current Price stays foreground per the node fill (#0a0a0a). Rows are inert —
 * only the pencil edits. Loading keeps the table silhouette with skeleton rows; error/empty
 * render a single full-span message row (DiscountsTable convention).
 * Contract: the row's edit affordance calls `onEdit(row)`.
 */

/*
 * Sentinel for the unfiltered "All …" option, mapped to `undefined` in the query input.
 * A real value (not "") because the Select trigger renders the placeholder for a falsy
 * selection, which would blank the control.
 */
const ALL = "all";

const SEARCH_DEBOUNCE_MS = 300;

const SKELETON_ROWS = 5;

/** Per-column skeleton widths mirroring typical cell content. */
const SKELETON_WIDTHS = ["w-3/4", "w-2/3", "w-24", "w-28", "w-8"];

export default function ManagePricesTable({ onEdit }: { onEdit: (row: ListingPriceRow) => void }) {
  const t = useTranslations("Discounts");
  const formatMoney = useMoney();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [location, setLocation] = useState(ALL);
  const [page, setPage] = useState(1);

  /* Debounce the search before it becomes query input, so the list doesn't refetch
   * on every keystroke. */
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  const filters = useListingPriceFilters();
  const { data, isPending, isError } = useListingPrices({
    query: debouncedSearch.trim() || undefined,
    category: category === ALL ? undefined : category,
    location: location === ALL ? undefined : location,
    page,
  });

  const typeOptions = [
    { value: ALL, label: t("prices.allTypes") },
    ...(filters.data?.categories ?? []),
  ];
  const locationOptions = [
    { value: ALL, label: t("prices.allLocations") },
    ...(filters.data?.locations ?? []),
  ];

  const price = (money: ListingPriceRow["basePrice"]) =>
    money ? formatMoney(money.amountMinor) : "—";

  const messageRow = (message: string) => (
    <TableRow>
      <TableCell colSpan={5} className="text-center text-sm font-medium text-natural-500">
        {message}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row">
        <TextField
          containerClassName="min-w-0 md:flex-1"
          fieldClassName="h-12"
          startIcon={<Search />}
          placeholder={t("prices.search")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        {/* Tablet flexes the three controls to near-thirds (Figma 200/194/194); the
            desktop-exact 222px selects only pin from xl, where the card is full width. */}
        <div className="flex min-w-0 gap-4 md:flex-[2] xl:flex-none">
          <div className="min-w-0 flex-1 xl:w-[222px] xl:flex-none">
            <Select
              className="h-12 min-w-0"
              ariaLabel={t("prices.allTypes")}
              options={typeOptions}
              isLoading={filters.isPending}
              value={category}
              onValueChange={(next) => {
                setCategory(next);
                setPage(1);
              }}
            />
          </div>
          <div className="min-w-0 flex-1 xl:w-[222px] xl:flex-none">
            <Select
              className="h-12 min-w-0"
              ariaLabel={t("prices.allLocations")}
              options={locationOptions}
              isLoading={filters.isPending}
              value={location}
              onValueChange={(next) => {
                setLocation(next);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {/* Header pinned to 50px, body rows to this node's 52px pitch (unlike DiscountsTable's 50). */}
      <Table className="min-w-[960px] table-fixed [&_td]:h-[52px] [&_td]:py-0 [&_th]:h-[50px] [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead>{t("prices.table.yacht")}</TableHead>
            <TableHead>{t("prices.table.location")}</TableHead>
            <TableHead>{t("prices.table.basePrice")}</TableHead>
            <TableHead>{t("prices.table.currentPrice")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("prices.table.edit")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending
            ? Array.from({ length: SKELETON_ROWS }, (_, row) => (
                <TableRow key={row}>
                  {SKELETON_WIDTHS.map((width) => (
                    <TableCell key={width}>
                      <Skeleton className={`h-4 rounded-md ${width}`} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : isError
              ? messageRow(t("prices.error"))
              : data.items.length === 0
                ? messageRow(t("prices.empty"))
                : data.items.map((row) => (
                    <TableRow key={row.listingId}>
                      <TableCell className="truncate">{row.title}</TableCell>
                      <TableCell className="truncate">
                        {`${row.locationName}, ${row.countryName}`}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{price(row.basePrice)}</TableCell>
                      <TableCell className="whitespace-nowrap">{price(row.currentPrice)}</TableCell>
                      <TableCell>
                        <IconButton
                          variant="subtle"
                          size="sm"
                          aria-label={t("prices.table.edit")}
                          onClick={() => onEdit(row)}
                        >
                          <SquarePen className="size-5" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
        </TableBody>
      </Table>

      {data && data.pagination.totalPages > 0 ? (
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
