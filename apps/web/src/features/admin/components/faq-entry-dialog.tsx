"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@yacht-charter/ui/components/form/form";
import { Radio, RadioGroup } from "@yacht-charter/ui/components/form/radio";
import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@yacht-charter/ui/components/navigation/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  useCreateFaqEntry,
  useDeleteFaqEntry,
  useFaqListingOptions,
  useUpdateFaqEntry,
} from "../hooks/use-faq";
import {
  FAQ_CATEGORIES,
  FAQ_LOCALES,
  type FaqCacheResult,
  type FaqGroupRow,
  type FaqLocale,
  faqTranslationState,
} from "../types";

/*
 * The FAQ editor: one question, all four languages, one save.
 *
 * The database stores a row per locale and the public read matches locale exactly, so the four
 * are genuinely four entries — but nobody writes an FAQ that way. A tab per language over one
 * shared scope and category is what an editor actually holds in their head, and it is also what
 * keeps the four rows agreeing about which question they are: they are found by scope, category
 * and position, and saving them together is what guarantees they share all three.
 *
 * A language tab left blank is not an instruction to delete that translation — the save simply
 * omits it and the server leaves it alone. Removing one is the explicit button inside its tab,
 * because clearing a textarea is far too easy to do by accident to mean "take this off the site".
 */

const SCOPES = ["site", "listing"] as const;
const QUESTION_MAX = 500;
const ANSWER_MAX = 8000;

type PaneValues = { question: string; answer: string };
type Values = {
  scope: (typeof SCOPES)[number];
  listingId: string;
  category: string;
  translations: Record<FaqLocale, PaneValues>;
};

const EMPTY_PANE: PaneValues = { question: "", answer: "" };

function toValues(group: FaqGroupRow | null): Values {
  const translations = {
    en: { ...EMPTY_PANE },
    de: { ...EMPTY_PANE },
    es: { ...EMPTY_PANE },
    uk: { ...EMPTY_PANE },
  };

  for (const entry of group?.translations ?? []) {
    translations[entry.locale] = { question: entry.question, answer: entry.answer ?? "" };
  }

  return {
    scope: group?.listingId ? "listing" : "site",
    listingId: group?.listingId ?? "",
    category: group?.category ?? "",
    translations,
  };
}

function useFaqEntrySchema() {
  const t = useTranslations("Admin.Faq.dialog.errors");

  return useMemo(() => {
    const pane = z.object({
      question: z.string().trim().max(QUESTION_MAX, t("questionTooLong")),
      answer: z.string().trim().max(ANSWER_MAX, t("answerTooLong")),
    });

    return z
      .object({
        scope: z.enum(SCOPES),
        listingId: z.string(),
        category: z.string(),
        translations: z.object({ en: pane, de: pane, es: pane, uk: pane }),
      })
      .superRefine((values, ctx) => {
        if (values.scope === "listing" && !values.listingId) {
          ctx.addIssue({ code: "custom", message: t("listingRequired"), path: ["listingId"] });
        }

        /* The `faq_scope_ck` rule, said here so it lands on the picker. A site-wide entry with
           no category has no heading to render under, which is the one combination the grouped
           page cannot place — and the constraint would otherwise surface as a bare 500. */
        if (values.scope === "site" && !values.category) {
          ctx.addIssue({ code: "custom", message: t("categoryRequired"), path: ["category"] });
        }

        const written = FAQ_LOCALES.filter(
          (locale) => values.translations[locale].question.trim().length > 0,
        );
        if (written.length === 0) {
          ctx.addIssue({
            code: "custom",
            message: t("questionRequired"),
            path: ["translations", "en", "question"],
          });
        }

        /* An answer with no question above it is a row the read path would drop and the editor
           would keep believing they had saved. */
        for (const code of FAQ_LOCALES) {
          const filled = values.translations[code];
          if (filled.answer.trim().length > 0 && filled.question.trim().length === 0) {
            ctx.addIssue({
              code: "custom",
              message: t("answerWithoutQuestion"),
              path: ["translations", code, "question"],
            });
          }
        }
      });
  }, [t]);
}

/** The three states a language can be in, as a dot on its tab — see `faqTranslationState`. */
const STATE_DOT = {
  answered: "bg-positive-500",
  unanswered: "bg-warning-500",
  missing: "bg-natural-200",
} as const;

export default function FaqEntryDialog({
  group,
  open,
  onOpenChange,
}: {
  group: FaqGroupRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Admin.Faq");
  const isEdit = group !== null;
  const [locale, setLocale] = useState<FaqLocale>("en");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const createEntry = useCreateFaqEntry();
  const updateEntry = useUpdateFaqEntry();
  const deleteEntry = useDeleteFaqEntry();
  const pending = createEntry.isPending || updateEntry.isPending;

  const schema = useFaqEntrySchema();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(group),
    mode: "onTouched",
  });

  /* Re-prefill on every open and whenever another row is picked while mounted, so a cancelled
     edit or an edit→edit switch never leaks the previous entry's wording. */
  useEffect(() => {
    if (!open) return;
    form.reset(toValues(group));
    setLocale("en");
    setSearch("");
  }, [open, group, form]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const scope = form.watch("scope");
  const listingOptions = useFaqListingOptions(debouncedSearch);
  const yachts = listingOptions.data?.items ?? [];
  const selectedListingId = form.watch("listingId");
  const selectedYacht =
    yachts.find((option) => option.id === selectedListingId) ??
    (group?.listingId === selectedListingId
      ? { id: selectedListingId, title: group?.listingTitle ?? selectedListingId }
      : null);

  /** The public page caches for hours; the save drops that cache, but not instantly. */
  const reportCache = (cache: FaqCacheResult) => {
    if (cache.ok) {
      toast.success(t(isEdit ? "dialog.saved" : "dialog.created"), {
        description: t("dialog.cacheRefreshing"),
      });
      return;
    }

    toast.warning(t(isEdit ? "dialog.saved" : "dialog.created"), {
      description: t("dialog.cacheStale"),
    });
  };

  const onSubmit = async (values: Values) => {
    const translations = FAQ_LOCALES.flatMap((code) => {
      const pane = values.translations[code];
      const question = pane.question.trim();
      if (!question) return [];
      return [{ locale: code, question, answer: pane.answer.trim() || null }];
    });

    const input = {
      listingId: values.scope === "listing" ? values.listingId : null,
      /* The select's empty value is "no category", which is only legal on a listing entry —
         the schema above has already refused the other combination. */
      category: FAQ_CATEGORIES.find((option) => option === values.category) ?? null,
      translations,
    };

    /* Any one of the group's rows addresses the whole of it; the first is simply the one the
       contract's ordering puts nearest the default locale. */
    const anchorId = group?.translations[0]?.id;

    try {
      const result = anchorId
        ? await updateEntry.mutateAsync({ id: anchorId, ...input })
        : await createEntry.mutateAsync(input);
      reportCache(result.cache);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("dialog.failed"));
    }
  };

  const removeTranslation = async (code: FaqLocale) => {
    const entry = group?.translations.find((item) => item.locale === code);
    if (!entry) return;

    try {
      const result = await deleteEntry.mutateAsync({ id: entry.id, allLocales: false });
      form.setValue(`translations.${code}`, { ...EMPTY_PANE });
      toast.success(t("dialog.translationRemoved", { locale: t(`locales.${code}`) }), {
        description: result.cache.ok ? t("dialog.cacheRefreshing") : t("dialog.cacheStale"),
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("dialog.failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        className="max-h-[calc(100dvh-2rem)] max-w-172 items-stretch overflow-hidden"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>{t(isEdit ? "dialog.editTitle" : "dialog.createTitle")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => void onSubmit(values))}
            className="flex min-h-0 w-full flex-1 flex-col gap-5 text-left"
          >
            {/* The four language panes make this the tallest dialog in the admin, so the fields
                scroll and the footer stays where the editor left it. */}
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto [scrollbar-width:thin]">
              <div className="grid items-start gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="scope"
                  render={({ field }) => (
                    <FormItem className="gap-3">
                      <FormLabel>{t("dialog.scope.label")}</FormLabel>
                      <RadioGroup value={field.value} onValueChange={field.onChange}>
                        <div className="flex flex-wrap gap-4">
                          {SCOPES.map((option) => (
                            <label
                              key={option}
                              className="flex w-fit cursor-pointer items-center gap-2 text-base leading-[1.4] text-foreground"
                            >
                              <Radio value={option} />
                              {t(`scope.${option}`)}
                            </label>
                          ))}
                        </div>
                      </RadioGroup>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("dialog.category.label")}</FormLabel>
                      <FormControl>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder={t("dialog.category.placeholder")}
                          options={FAQ_CATEGORIES.map((option) => ({
                            value: option,
                            label: t(`categories.${option}`),
                          }))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {scope === "listing" ? (
                <FormField
                  control={form.control}
                  name="listingId"
                  render={({ field }) => (
                    <FormItem className="gap-2">
                      <FormLabel>{t("dialog.listing.label")}</FormLabel>
                      {selectedYacht ? (
                        <Chip
                          variant="brand"
                          className="w-fit"
                          onRemove={() => field.onChange("")}
                          removeLabel={t("dialog.listing.clear")}
                        >
                          {selectedYacht.title}
                        </Chip>
                      ) : null}
                      <TextField
                        startIcon={<Search />}
                        placeholder={t("dialog.listing.search")}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                      <div className="flex max-h-44 flex-col overflow-y-auto rounded-lg border border-natural-100 [scrollbar-width:thin]">
                        {yachts.length === 0 ? (
                          <p className="px-3 py-3 text-sm leading-[1.4] text-natural-500">
                            {t("dialog.listing.noResults")}
                          </p>
                        ) : (
                          yachts.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => field.onChange(option.id)}
                              className="cursor-pointer border-b border-natural-50 px-3 py-2.5 text-left text-base leading-[1.4] text-foreground last:border-b-0 hover:bg-natural-50"
                            >
                              {option.title}
                              <span className="ml-2 text-sm text-natural-500">
                                {option.baseName}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              <Tabs
                value={locale}
                onValueChange={(next) => {
                  const picked = FAQ_LOCALES.find((code) => code === next);
                  if (picked) setLocale(picked);
                }}
              >
                <TabsList>
                  {FAQ_LOCALES.map((code) => {
                    const state = group ? faqTranslationState(group, code) : "missing";
                    return (
                      <TabsTab key={code} value={code} className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className={`size-2 shrink-0 rounded-full ${STATE_DOT[state]}`}
                        />
                        {t(`locales.${code}`)}
                        <span className="sr-only">{t(`state.${state}`)}</span>
                      </TabsTab>
                    );
                  })}
                </TabsList>

                {FAQ_LOCALES.map((code) => (
                  <TabsPanel key={code} value={code} className="flex flex-col gap-4 pt-2">
                    <FormField
                      control={form.control}
                      name={`translations.${code}.question`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("dialog.question.label")}</FormLabel>
                          <FormControl>
                            <TextField placeholder={t("dialog.question.placeholder")} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`translations.${code}.answer`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("dialog.answer.label")}</FormLabel>
                          <FormControl>
                            <TextField
                              multiline
                              className="min-h-32"
                              placeholder={t("dialog.answer.placeholder")}
                              supportingText={t("dialog.answer.hint")}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {group?.translations.some((entry) => entry.locale === code) ? (
                      <Button
                        type="button"
                        variant="subtle"
                        size="sm"
                        className="w-fit text-error-500"
                        disabled={deleteEntry.isPending}
                        onClick={() => void removeTranslation(code)}
                      >
                        {t("dialog.removeTranslation")}
                      </Button>
                    ) : null}
                  </TabsPanel>
                ))}
              </Tabs>
            </div>

            <DialogFooter className="shrink-0">
              <Button type="button" variant="neutral" onClick={() => onOpenChange(false)}>
                {t("dialog.cancel")}
              </Button>
              <Button type="submit" variant="brand" disabled={pending}>
                {t(isEdit ? "dialog.save" : "dialog.create")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
