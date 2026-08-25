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
import { ArrowDown, ArrowUp, Check, Minus, Plus, Search, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  useDeleteFaqEntry,
  useFaqList,
  useFaqListingOptions,
  useReorderFaq,
} from "../hooks/use-faq";
import {
  FAQ_CATEGORIES,
  FAQ_LOCALES,
  type FaqGap,
  type FaqGroupRow,
  faqIsUnpublished,
  type FaqScope,
  type FaqTranslationState,
  faqTranslationState,
} from "../types";
import FaqEntryDialog from "./faq-entry-dialog";

/*
 * FaqTable — the FAQ as one row per question, not one per locale.
 *
 * Eighty rows sorted by nothing an editor recognises is what the flat table would be: the same
 * twenty questions four times over, with no way to see that the German one is missing except by
 * scrolling to where it would have been. So a row here is the question, and the four languages
 * are a strip of chips on it. Each chip is one of three states — answered, written but
 * unanswered, absent — because the public read matches locale exactly and drops a blank answer,
 * which makes "written but unanswered" every bit as invisible as "absent" and much harder to
 * notice. Colour is never the only carrier: each chip has its own glyph and its own title.
 *
 * The two filters underneath are the two passes the client will actually work: everything with
 * no answer, and everything missing a language.
 */

/* Sentinel for "All …": a real value, since a falsy selection makes Select show its placeholder. */
const ALL = "all";

const COLUMN_COUNT = 5;
const SKELETON_ROWS = 5;
const SKELETON_WIDTHS = ["w-8", "w-72", "w-40", "w-24", "w-32"];

const STATE_VARIANTS = {
  answered: "success",
  unanswered: "warning",
  missing: "outline",
} as const satisfies Record<FaqTranslationState, string>;

const STATE_ICONS = {
  answered: Check,
  unanswered: TriangleAlert,
  missing: Minus,
} as const satisfies Record<FaqTranslationState, typeof Check>;

const GAPS: readonly NonNullable<FaqGap>[] = ["missing_answer", "missing_locale"];

export default function FaqTable() {
  const t = useTranslations("Admin.Faq");
  const [scope, setScope] = useState<FaqScope>("site");
  const [listingId, setListingId] = useState("");
  const [listingSearch, setListingSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [locale, setLocale] = useState(ALL);
  const [gap, setGap] = useState(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<FaqGroupRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const deleteEntry = useDeleteFaqEntry();
  const reorder = useReorderFaq();

  /* The ALL sentinel is in none of the lists, so each one drops out as `undefined`. */
  const selectedCategory = FAQ_CATEGORIES.find((option) => option === category);
  const selectedLocale = FAQ_LOCALES.find((option) => option === locale);
  const selectedGap = GAPS.find((option) => option === gap);

  const { data, isPending, isError } = useFaqList({
    scope,
    listingId: listingId || undefined,
    category: selectedCategory,
    locale: selectedLocale,
    gap: selectedGap,
    query: query.trim() || undefined,
    page,
  });

  /*
   * Reordering writes positions across the whole of one category, so it is offered only where
   * the screen is showing the whole of one category: one category chosen, one language chosen
   * (positions are submitted as that language's rows), nothing filtered away, and the list
   * fitting on this page. Anywhere else the buttons would be renumbering a list against a view
   * that is not it.
   */
  const canReorder =
    selectedCategory !== undefined &&
    selectedLocale !== undefined &&
    selectedGap === undefined &&
    query.trim().length === 0 &&
    (scope === "site" || listingId.length > 0) &&
    (data?.pagination.totalPages ?? 0) <= 1;

  const openEditor = (group: FaqGroupRow | null) => {
    setEditing(group);
    setDialogOpen(true);
  };

  const move = (index: number, delta: number) => {
    const groups = data?.items ?? [];
    const target = index + delta;
    if (!selectedLocale || target < 0 || target >= groups.length) return;

    const ordered = [...groups];
    const [moved] = ordered.splice(index, 1);
    if (!moved) return;
    ordered.splice(target, 0, moved);

    /* Positions belong to rows, so the ids submitted are this language's rows. Entries with no
       row in it are not on this list at all and the server settles them after. */
    const ids = ordered.flatMap(
      (group) => group.translations.find((entry) => entry.locale === selectedLocale)?.id ?? [],
    );

    reorder.mutate(
      {
        listingId: scope === "listing" ? listingId : null,
        category: selectedCategory ?? null,
        locale: selectedLocale,
        ids,
      },
      {
        onSuccess: (result) =>
          toast.success(t("reordered"), {
            description: result.cache.ok ? t("dialog.cacheRefreshing") : t("dialog.cacheStale"),
          }),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  const remove = (group: FaqGroupRow) => {
    const anchor = group.translations[0];
    if (!anchor) return;

    deleteEntry.mutate(
      { id: anchor.id, allLocales: true },
      {
        onSuccess: (result) =>
          toast.success(t("deleted", { count: result.ids.length }), {
            description: result.cache.ok ? t("dialog.cacheRefreshing") : t("dialog.cacheStale"),
          }),
        onError: (error: Error) => toast.error(error.message),
      },
    );
  };

  const onFilterChange = (set: (next: string) => void) => (next: string) => {
    set(next);
    setPage(1);
  };

  /** The question as the chosen language has it, falling back to whichever language has one. */
  const questionOf = (group: FaqGroupRow) => {
    const preferred = selectedLocale
      ? group.translations.find((entry) => entry.locale === selectedLocale)
      : undefined;
    return preferred ?? group.translations[0];
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
      <div className="flex flex-col gap-4 md:flex-row md:flex-wrap">
        <div className="min-w-0 md:w-44">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.scope")}
            value={scope}
            onValueChange={(next) => {
              setScope(next === "listing" ? "listing" : "site");
              setListingId("");
              setPage(1);
            }}
            options={[
              { value: "site", label: t("scope.site") },
              { value: "listing", label: t("scope.listing") },
            ]}
          />
        </div>
        <div className="min-w-0 md:w-48">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.category")}
            value={category}
            onValueChange={onFilterChange(setCategory)}
            options={[
              { value: ALL, label: t("filters.allCategories") },
              ...FAQ_CATEGORIES.map((value) => ({ value, label: t(`categories.${value}`) })),
            ]}
          />
        </div>
        <div className="min-w-0 md:w-44">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.locale")}
            value={locale}
            onValueChange={onFilterChange(setLocale)}
            options={[
              { value: ALL, label: t("filters.anyLocale") },
              ...FAQ_LOCALES.map((value) => ({ value, label: t(`locales.${value}`) })),
            ]}
          />
        </div>
        <div className="min-w-0 md:w-52">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("filters.gap")}
            value={gap}
            onValueChange={onFilterChange(setGap)}
            options={[
              { value: ALL, label: t("filters.allEntries") },
              ...GAPS.map((value) => ({ value, label: t(`gaps.${value}`) })),
            ]}
          />
        </div>
        {/* `className` lands on the input; the bordered field is `fieldClassName`, which is
            what has to match the Select's 48px. */}
        <TextField
          containerClassName="min-w-0 md:min-w-64 md:flex-1 md:basis-64"
          fieldClassName="h-12"
          value={query}
          startIcon={<Search />}
          placeholder={t("filters.search")}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <Button variant="brand" className="h-12 shrink-0" onClick={() => openEditor(null)}>
          <Plus className="size-4" />
          {t("actions.create")}
        </Button>
      </div>

      {scope === "listing" ? (
        <FaqListingPicker
          listingId={listingId}
          search={listingSearch}
          onSearchChange={setListingSearch}
          onPick={(id) => {
            setListingId(id);
            setPage(1);
          }}
        />
      ) : null}

      {/* The chips carry meaning, so the meaning is written down once rather than left to hue. */}
      <div className="flex flex-wrap items-center gap-3 text-sm leading-[1.4] text-natural-500">
        <span className="font-semibold text-foreground">{t("legend.title")}</span>
        {(["answered", "unanswered", "missing"] as const).map((state) => {
          const Icon = STATE_ICONS[state];
          return (
            <span key={state} className="flex items-center gap-1.5">
              <Chip variant={STATE_VARIANTS[state]}>
                <Icon />
              </Chip>
              {t(`state.${state}`)}
            </span>
          );
        })}
      </div>

      <Table className="min-w-[1000px] [&_td]:py-3 [&_th]:h-[50px] [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">{t("table.order")}</TableHead>
            <TableHead>{t("table.question")}</TableHead>
            <TableHead>{t("table.locales")}</TableHead>
            <TableHead>{t("table.category")}</TableHead>
            <TableHead>{t("table.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {scope === "listing" && !listingId
            ? messageRow(t("chooseListing"))
            : isPending
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
                  : data.items.map((group, index) => {
                      const shown = questionOf(group);
                      return (
                        <TableRow key={group.key}>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <span className="w-6 text-sm text-natural-500">
                                {group.sortOrder + 1}
                              </span>
                              <Button
                                variant="subtle"
                                size="sm"
                                aria-label={t("actions.moveUp")}
                                title={canReorder ? t("actions.moveUp") : t("reorderDisabled")}
                                disabled={!canReorder || index === 0 || reorder.isPending}
                                onClick={() => move(index, -1)}
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                variant="subtle"
                                size="sm"
                                aria-label={t("actions.moveDown")}
                                title={canReorder ? t("actions.moveDown") : t("reorderDisabled")}
                                disabled={
                                  !canReorder ||
                                  index === data.items.length - 1 ||
                                  reorder.isPending
                                }
                                onClick={() => move(index, 1)}
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex max-w-160 flex-col gap-1">
                              <span className="font-medium text-foreground">
                                {shown?.question ?? t("noQuestion")}
                              </span>
                              <div className="flex flex-wrap items-center gap-2">
                                {/* Nothing answered anywhere: the entry is on this list and on no
                                  page at all, which is the state that reads as published. */}
                                {faqIsUnpublished(group) ? (
                                  <Chip variant="warning">{t("unpublished")}</Chip>
                                ) : null}
                                {group.listingTitle ? (
                                  <span className="text-sm text-natural-500">
                                    {group.listingTitle}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {FAQ_LOCALES.map((code) => {
                                const state = faqTranslationState(group, code);
                                const Icon = STATE_ICONS[state];
                                return (
                                  <Chip
                                    key={code}
                                    variant={STATE_VARIANTS[state]}
                                    title={`${t(`locales.${code}`)} — ${t(`state.${state}`)}`}
                                  >
                                    <Icon />
                                    {t(`localeCodes.${code}`)}
                                  </Chip>
                                );
                              })}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {group.category ? t(`categories.${group.category}`) : t("noCategory")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button variant="brand" size="sm" onClick={() => openEditor(group)}>
                                {t("actions.edit")}
                              </Button>
                              <Button
                                variant="subtle"
                                size="sm"
                                className="text-error-500"
                                disabled={deleteEntry.isPending}
                                onClick={() => remove(group)}
                              >
                                {t("actions.delete")}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
        </TableBody>
      </Table>

      {/*
        How much of this is still outstanding, counted over everything the filters match rather
        than over the page. The client fills the FAQ in over weeks; "17 of 20 still have no
        German answer" is the only number on this screen that says how far along that is.
      */}
      {data ? (
        <div className="flex flex-col gap-1 text-sm leading-[1.4] font-medium">
          {data.summary.missingAnswer > 0 ? (
            <p className="text-warning-600">
              {t("summary.missingAnswer", {
                count: data.summary.missingAnswer,
                total: data.summary.groups,
                locale: selectedLocale ? t(`locales.${selectedLocale}`) : t("filters.anyLocale"),
              })}
            </p>
          ) : null}
          {data.summary.missingLocale > 0 ? (
            <p className="text-natural-500">
              {t("summary.missingLocale", {
                count: data.summary.missingLocale,
                total: data.summary.groups,
                locale: selectedLocale ? t(`locales.${selectedLocale}`) : t("filters.anyLocale"),
              })}
            </p>
          ) : null}
        </div>
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

      <FaqEntryDialog group={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

/**
 * The yacht a listing-scoped list is about.
 *
 * A separate control rather than another select: the catalogue is thousands of listings, so this
 * is a typeahead, and it is the one filter that decides whether there is anything to read at all.
 */
function FaqListingPicker({
  listingId,
  search,
  onSearchChange,
  onPick,
}: {
  listingId: string;
  search: string;
  onSearchChange: (next: string) => void;
  onPick: (id: string) => void;
}) {
  const t = useTranslations("Admin.Faq");
  const [debounced, setDebounced] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const options = useFaqListingOptions(debounced);
  const items = options.data?.items ?? [];
  const chosen = items.find((option) => option.id === listingId);

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-natural-50 p-4">
      <span className="text-sm leading-4.25 font-semibold text-foreground">
        {t("filters.listing")}
      </span>
      <TextField
        startIcon={<Search />}
        fieldClassName="bg-card"
        placeholder={t("filters.listingSearch")}
        value={search}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 8).map((option) => (
          <Button
            key={option.id}
            variant={option.id === listingId ? "brand" : "subtle"}
            size="sm"
            onClick={() => onPick(option.id)}
          >
            {option.title}
          </Button>
        ))}
      </div>
      {chosen ? <span className="text-sm text-natural-500">{chosen.baseName}</span> : null}
    </div>
  );
}
