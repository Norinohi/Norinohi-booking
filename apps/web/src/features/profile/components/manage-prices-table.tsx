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
import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { Search, SquarePen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { PRICES_PAGE_COUNT, SAMPLE_PRICES, type YachtPrice } from "../lib/discounts";

/*
 * ManagePricesTable — the "Manage Prices" tab of /profile/discounts: search + type/location
 * filters over the provider listings, the price table and its pager.
 * Figma "Discount & Price Manager / Manage Prices": desktop 972:55440 / tablet 973:103838 /
 * mobile 973:103902.
 * Filter row (48px controls, 16px gaps): search flexes, selects 222px on desktop; below md
 * the search goes full-width with the selects splitting a row underneath. Filters are local
 * state over SAMPLE_PRICES. Table: five equal columns (`table-fixed`, min 960px per tablet
 * metadata so narrow screens scroll), header on natural-50, 50px rows; Current Price stays
 * foreground per the node fill (#0a0a0a). Rows are inert — only the pencil edits.
 * Contract: the row's edit affordance calls `onEdit(yacht)`.
 */

/** Sentinel for the unfiltered "All …" option — sample values are display strings. */
const ALL = "all";

const TYPE_VALUES = [...new Set(SAMPLE_PRICES.map((yacht) => yacht.type))];
const LOCATION_VALUES = [...new Set(SAMPLE_PRICES.map((yacht) => yacht.location))];

export default function ManagePricesTable({ onEdit }: { onEdit: (yacht: YachtPrice) => void }) {
  const t = useTranslations("Discounts");
  const [search, setSearch] = useState("");
  const [type, setType] = useState(ALL);
  const [location, setLocation] = useState(ALL);
  const [page, setPage] = useState(1);

  const typeOptions = [
    { value: ALL, label: t("prices.allTypes") },
    ...TYPE_VALUES.map((value) => ({ value, label: value })),
  ];
  const locationOptions = [
    { value: ALL, label: t("prices.allLocations") },
    ...LOCATION_VALUES.map((value) => ({ value, label: value })),
  ];

  const query = search.trim().toLowerCase();
  const rows = SAMPLE_PRICES.filter(
    (yacht) =>
      (query === "" || yacht.name.toLowerCase().includes(query)) &&
      (type === ALL || yacht.type === type) &&
      (location === ALL || yacht.location === location),
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
              value={type}
              onValueChange={(next) => {
                setType(next);
                setPage(1);
              }}
            />
          </div>
          <div className="min-w-0 flex-1 xl:w-[222px] xl:flex-none">
            <Select
              className="h-12 min-w-0"
              ariaLabel={t("prices.allLocations")}
              options={locationOptions}
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
          {rows.map((yacht) => (
            <TableRow key={yacht.id}>
              <TableCell className="truncate">{yacht.name}</TableCell>
              <TableCell className="truncate">{yacht.location}</TableCell>
              <TableCell className="whitespace-nowrap">{yacht.basePrice}</TableCell>
              <TableCell className="whitespace-nowrap">{yacht.currentPrice}</TableCell>
              <TableCell>
                <IconButton
                  variant="subtle"
                  size="sm"
                  aria-label={t("prices.table.edit")}
                  onClick={() => onEdit(yacht)}
                >
                  <SquarePen className="size-5" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex justify-center md:justify-start">
        <PaginationControl
          page={page}
          onPageChange={setPage}
          pageCount={PRICES_PAGE_COUNT}
          summary={false}
        />
      </div>
    </div>
  );
}
