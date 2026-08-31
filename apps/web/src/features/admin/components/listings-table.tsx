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
import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { EyeOff, ImageOff, Layers, Search, Undo2, Upload } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import ListingSourcesDialog from "./listing-sources-dialog";
import { toast } from "sonner";

import { Image } from "@/components/shared/data-display/image";
import { Link } from "@/i18n/navigation";

import { useListings, useSetListingStatus } from "../hooks/use-listings";
import {
  type ListingAdminRow,
  type ListingStatus,
  type MovableStatus,
  type ProviderKey,
  toProviderKey,
} from "../types";

/*
 * ListingsTable: the catalogue as staff see it, drafts included.
 *
 * A provider sync imports as `draft` so unreviewed vendor inventory never reaches customers, and
 * public search shows published listings only, so this table is the only place those drafts are
 * visible at all. It is a review queue: read the row, then release it or put it back.
 * Columns follow the SyncRunsTable conventions (min-width so narrow screens scroll, 50px header
 * rows). Status carries the colour so a page of mixed statuses is scannable at a glance.
 */

/* Sentinel for "All …": a real value, since a falsy selection makes Select show its placeholder. */
const ALL = "all";

const PROVIDERS: readonly ProviderKey[] = ["mock", "booking_manager", "nausys"];
/*
 * The three a person can move a listing between. `merged` is absent on purpose: a merge
 * writes it to record that this listing's offers moved to another one, and nothing here
 * should offer it as a destination.
 */
const STATUSES: readonly MovableStatus[] = ["draft", "published", "hidden"];

/*
 * The filter answers a different question than the move menu, so it carries `merged`
 * too: after a merge the absorbed listing stays in the table, and finding those is how
 * a reviewer checks what a merge did or picks one to split back out.
 */
const FILTER_STATUSES: readonly ListingStatus[] = [...STATUSES, "merged"];

const STATUS_VARIANTS = {
  draft: "warning",
  published: "success",
  hidden: "neutral",
  merged: "neutral",
} as const satisfies Record<ListingStatus, string>;

const COLUMN_COUNT = 8;
const SKELETON_ROWS = 5;
const SKELETON_WIDTHS = ["w-40", "w-20", "w-24", "w-24", "w-28", "w-20", "w-16", "w-40"];

export default function ListingsTable() {
  const t = useTranslations("Admin.Listings");
  const tProviders = useTranslations("Admin.providers");
  const format = useFormatter();
  const [provider, setProvider] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  /** The listing whose provider sources are open, or null. Null closes the dialog. */
  const [sourcesFor, setSourcesFor] = useState<ListingAdminRow | null>(null);

  const setStatusMutation = useSetListingStatus();

  const { data, isPending, isError } = useListings({
    /* The ALL sentinel is in neither list, so it drops out as `undefined`. */
    provider: PROVIDERS.find((option) => option === provider),
    status: FILTER_STATUSES.find((option) => option === status),
    query: query.trim() || undefined,
    page,
  });

  /** The stored provider code, which may name a connector this build does not ship. */
  const providerLabel = (code: string | null) => {
    if (!code) return t("noProvider");
    const key = toProviderKey(code);
    return key ? tProviders(key) : code;
  };

  /* Null until availability has been synced and priced, which is the normal state of a
     freshly imported draft, so it reads as "not priced yet" rather than as an error. */
  const priceLabel = (listing: ListingAdminRow) =>
    listing.priceFromMinor !== null && listing.currency
      ? format.number(listing.priceFromMinor / 100, {
          style: "currency",
          currency: listing.currency,
        })
      : t("noPrice");

  const modelLabel = (listing: ListingAdminRow) =>
    [listing.modelName, listing.yearBuilt].filter(Boolean).join(" · ") || t("notSet");

  const placeLabel = (listing: ListingAdminRow) =>
    [listing.baseName, listing.locationName].filter(Boolean).join(" · ") || t("notSet");

  const move = (listing: ListingAdminRow, next: MovableStatus) => {
    setStatusMutation.mutate(
      { id: listing.id, status: next },
      {
        onSuccess: () =>
          toast.success(t("moved", { title: listing.title, status: t(`status.${next}`) })),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

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
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="min-w-0 md:w-56">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.provider")}
            value={provider}
            onValueChange={onFilterChange(setProvider)}
            options={[
              { value: ALL, label: t("filters.allProviders") },
              ...PROVIDERS.map((key) => ({
                value: key,
                label: tProviders(key),
              })),
            ]}
          />
        </div>
        <div className="min-w-0 md:w-56">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.status")}
            value={status}
            onValueChange={onFilterChange(setStatus)}
            options={[
              { value: ALL, label: t("filters.allStatuses") },
              ...FILTER_STATUSES.map((value) => ({ value, label: t(`status.${value}`) })),
            ]}
          />
        </div>
        {/* `className` lands on the input; the bordered field is `fieldClassName`, which is
            what has to match the Select's 48px. */}
        <TextField
          containerClassName="min-w-0 md:flex-1"
          fieldClassName="h-12"
          value={query}
          startIcon={<Search />}
          placeholder={t("filters.search")}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </div>

      <Table className="min-w-[1200px] [&_td]:py-3 [&_th]:h-[50px] [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.listing")}</TableHead>
            <TableHead>{t("table.provider")}</TableHead>
            <TableHead>{t("table.operator")}</TableHead>
            <TableHead>{t("table.model")}</TableHead>
            <TableHead>{t("table.place")}</TableHead>
            <TableHead>{t("table.price")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
            <TableHead>{t("table.actions")}</TableHead>
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
                : data.items.map((listing) => (
                    <TableRow key={listing.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="relative size-14 shrink-0 overflow-hidden rounded-md bg-natural-50">
                            {listing.primaryImageUrl ? (
                              <Image
                                fill
                                src={listing.primaryImageUrl}
                                alt={listing.title}
                                sizes="56px"
                                className="object-cover"
                              />
                            ) : (
                              <div
                                aria-label={t("noImage")}
                                className="flex h-full items-center justify-center text-natural-400"
                              >
                                <ImageOff className="size-5" />
                              </div>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-col">
                            {/* A new tab because the filters above are component state —
                                returning would land on page one, unfiltered. An unpublished row
                                404s until the detail route grows a staff preview: the page reads
                                listing_search_doc, which projects published listings only. */}
                            <Link
                              href={`/yachts/${listing.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate font-medium text-brand hover:underline"
                            >
                              {listing.title}
                            </Link>
                            <span className="truncate text-sm text-natural-500">
                              {listing.slug}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {providerLabel(listing.provider)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {listing.operatorName ?? t("notSet")}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{modelLabel(listing)}</TableCell>
                      <TableCell className="whitespace-nowrap">{placeLabel(listing)}</TableCell>
                      <TableCell className="whitespace-nowrap">{priceLabel(listing)}</TableCell>
                      <TableCell>
                        <Chip variant={STATUS_VARIANTS[listing.status]}>
                          {t(`status.${listing.status}`)}
                        </Chip>
                      </TableCell>
                      <TableCell>
                        {/* Only the moves that change something: the row's own status is never
                            offered back to itself. */}
                        <div className="flex items-center gap-2">
                          {/*
                            Only where there is something to choose between. On a listing one
                            vendor sells, every field group has exactly one candidate and the
                            dialog would be a page of foregone conclusions.
                          */}
                          {listing.offerCount > 1 ? (
                            <Button
                              variant="neutral"
                              size="sm"
                              onClick={() => setSourcesFor(listing)}
                            >
                              <Layers />
                              {t("actions.sources")}
                            </Button>
                          ) : null}
                          {/*
                            A merged listing has no offers left — they moved to the survivor —
                            so none of these are moves it can make. Publishing one would put an
                            empty card back into search; splitting an offer back out is the way
                            to undo it, and that lives in the duplicate queue.
                          */}
                          {listing.status === "merged" ? null : (
                            <>
                              {listing.status === "published" ? null : (
                                <Button
                                  variant="brand"
                                  size="sm"
                                  disabled={setStatusMutation.isPending}
                                  onClick={() => move(listing, "published")}
                                >
                                  <Upload />
                                  {t("actions.publish")}
                                </Button>
                              )}
                              {listing.status === "hidden" ? null : (
                                <Button
                                  variant="neutral"
                                  size="sm"
                                  disabled={setStatusMutation.isPending}
                                  onClick={() => move(listing, "hidden")}
                                >
                                  <EyeOff />
                                  {t("actions.unpublish")}
                                </Button>
                              )}
                              {listing.status === "draft" ? null : (
                                <Button
                                  variant="neutral"
                                  size="sm"
                                  disabled={setStatusMutation.isPending}
                                  onClick={() => move(listing, "draft")}
                                >
                                  <Undo2 />
                                  {t("actions.draft")}
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
        </TableBody>
      </Table>

      {/*
        Health, not decoration. A listing with free dates and no published rate is sold
        as "On request" and shows a calendar that refuses every day; a handful of those
        is a fleet priced by conversation, thousands is a price sweep that did not
        finish, and nothing else on this screen tells the two apart.
      */}
      {data && data.summary.unpricedWithDates > 0 ? (
        <p className="text-sm leading-[1.4] font-medium text-warning-600">
          {t("unpriced", { count: data.summary.unpricedWithDates })}
        </p>
      ) : null}

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

      {sourcesFor ? (
        <ListingSourcesDialog
          listingId={sourcesFor.id}
          listingTitle={sourcesFor.title}
          open
          onOpenChange={(next) => {
            if (!next) setSourcesFor(null);
          }}
        />
      ) : null}
    </div>
  );
}
