"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@yacht-charter/ui/components/actions/button";
import type { DateRange } from "@yacht-charter/ui/components/form/calendar";
import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@yacht-charter/ui/components/form/form";
import { Radio, RadioGroup } from "@yacht-charter/ui/components/form/radio";
import { Switch } from "@yacht-charter/ui/components/form/switch";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { Dialog, DialogContent, DialogTitle } from "@yacht-charter/ui/components/overlay/dialog";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import Loader from "@/components/shared/feedback/loader";
import DatePicker from "@/components/shared/form/date-picker";

import {
  useCreateDiscount,
  useDiscount,
  useDiscountYachtOptions,
  useSetDiscountActive,
  useUpdateDiscount,
} from "../hooks/use-discounts";
import { CATEGORY_TARGET_OPTIONS, type CategoryTargetKey } from "../lib/discounts";
import type { Discount } from "../types";

/*
 * DiscountDialog — the Create/Edit discount modal of /profile/discounts.
 * Figma "Discount & Price Manager": create 972:55119 (+ Specific Yachts state 972:55323),
 * edit 972:55221; tablet 973:101833; mobile 973:99174-range frames.
 * 688px modal, 20px section paddings, 16px field gaps, 316px half-width fields; the title
 * and the submit button sit in fixed bands with separators and only the field area scrolls.
 * Contract: `discountId` null/undefined → create mode; an id → edit mode, prefilled from
 * the admin.discount.get query. Writes go through admin.discount.create/update.
 */

const DISCOUNT_TYPES = ["percentage", "fixed_amount"] as const;

type AppliesToOption = "allYachts" | CategoryTargetKey | "specific";

/** "All yachts", the seeded category targets, then the specific-yachts picker toggle. */
const APPLIES_TO_OPTIONS: AppliesToOption[] = [
  "allYachts",
  ...CATEGORY_TARGET_OPTIONS.map((option) => option.key),
  "specific",
];

function useDiscountSchema() {
  const t = useTranslations("Discounts.dialog.errors");

  return useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("nameRequired")),
        /* Same alphabet the API enforces — codes are shared as links, so no spaces. */
        code: z
          .string()
          .min(1, t("codeRequired"))
          .regex(/^[A-Za-z0-9_-]+$/, t("codeRequired")),
        type: z.enum(["percentage", "fixed_amount"]),
        /* Kept as a string so the input round-trips; positivity checked on the parsed number. */
        value: z
          .string()
          .min(1, t("priceRequired"))
          .refine((value) => Number(value) > 0, t("priceRequired")),
        expires: z.custom<DateRange>().optional(),
        /* Blank means unlimited. Kept as a string so the input round-trips, like `value`. */
        usageLimit: z
          .string()
          .refine(
            (value) => value === "" || (Number.isInteger(Number(value)) && Number(value) >= 1),
            t("usageLimitInvalid"),
          ),
        appliesTo: z.array(z.string()),
        specificYachts: z.array(z.string()),
      }),
    [t],
  );
}

type Values = z.infer<ReturnType<typeof useDiscountSchema>>;

function toValues(discount: Discount | null | undefined): Values {
  if (!discount) {
    return {
      name: "",
      code: "",
      type: "percentage",
      value: "",
      expires: undefined,
      usageLimit: "",
      /* The Figma create state opens with "All yachts" pre-checked. */
      appliesTo: ["allYachts"],
      specificYachts: [],
    };
  }

  const appliesTo: string[] = [];
  const specificYachts: string[] = [];
  for (const target of discount.targets) {
    if (target.targetType === "all") {
      if (!appliesTo.includes("allYachts")) appliesTo.push("allYachts");
    } else if (target.targetType === "category") {
      /* Unknown category ids (not in the seeded set) have no checkbox — skip them. */
      const option = CATEGORY_TARGET_OPTIONS.find((entry) => entry.id === target.targetId);
      if (option && !appliesTo.includes(option.key)) appliesTo.push(option.key);
    } else if (target.targetType === "listing" && target.targetId) {
      specificYachts.push(target.targetId);
      if (!appliesTo.includes("specific")) appliesTo.push("specific");
    }
  }

  return {
    name: discount.name,
    code: discount.code,
    type: discount.type,
    value:
      discount.type === "percentage"
        ? String(discount.valuePct ?? "")
        : discount.value
          ? String(discount.value.amountMinor / 100)
          : "",
    usageLimit: discount.usageLimit === null ? "" : String(discount.usageLimit),
    expires: discount.startsAt
      ? {
          from: new Date(discount.startsAt),
          to: discount.endsAt ? new Date(discount.endsAt) : undefined,
        }
      : undefined,
    appliesTo,
    specificYachts,
  };
}

/** Local-date → "YYYY-MM-DD". `toISOString` would shift the day across timezones. */
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Checked boxes → API targets. "All yachts" swallows every narrower selection. */
function toTargets(
  values: Values,
): { targetType: "all" | "category" | "listing"; targetId?: string }[] {
  if (values.appliesTo.includes("allYachts")) return [{ targetType: "all" }];

  const targets: { targetType: "all" | "category" | "listing"; targetId?: string }[] = [];
  for (const option of CATEGORY_TARGET_OPTIONS) {
    if (values.appliesTo.includes(option.key)) {
      targets.push({ targetType: "category", targetId: option.id });
    }
  }
  if (values.appliesTo.includes("specific")) {
    for (const id of values.specificYachts) targets.push({ targetType: "listing", targetId: id });
  }
  return targets;
}

/** Immutable membership toggle for the checkbox-array fields. */
function toggle<T>(list: T[], item: T, present: boolean): T[] {
  return present ? [...list, item] : list.filter((entry) => entry !== item);
}

export default function DiscountDialog({
  open,
  onOpenChange,
  discountId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discountId?: string | null;
}) {
  const t = useTranslations("Discounts");
  const isEdit = discountId != null;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const discountQuery = useDiscount(discountId ?? null);
  const discount = discountQuery.data;

  /* Typeahead behind the "Specific Yachts" picker — debounced so typing does not
   * fire a request per keystroke. */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const yachtOptionsQuery = useDiscountYachtOptions(debouncedSearch);
  const visibleYachts = yachtOptionsQuery.data?.items ?? [];

  const createDiscount = useCreateDiscount();
  const updateDiscount = useUpdateDiscount();
  const setActive = useSetDiscountActive();
  const pending = createDiscount.isPending || updateDiscount.isPending;

  const schema = useDiscountSchema();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(discount),
    mode: "onTouched",
  });

  /* Re-prefill on every open and whenever another row is picked while mounted, so a
   * dirty cancel or an edit→edit switch never leaks the previous values. */
  useEffect(() => {
    if (!open) return;
    form.reset(toValues(discount));
    setSearch("");
  }, [open, discount, form]);

  const showSpecific = form.watch("appliesTo").includes("specific");

  const onSubmit = (values: Values) => {
    const targets = toTargets(values);
    if (targets.length === 0) {
      form.setError("appliesTo", { message: t("dialog.errors.appliesRequired") });
      return;
    }

    const input = {
      name: values.name,
      code: values.code,
      type: values.type,
      valuePct: values.type === "percentage" ? Number(values.value) : null,
      valueMinor: values.type === "fixed_amount" ? Math.round(Number(values.value) * 100) : null,
      currency: values.type === "fixed_amount" ? "EUR" : undefined,
      usageLimit: values.usageLimit === "" ? null : Number(values.usageLimit),
      startsAt: values.expires?.from ? toIsoDate(values.expires.from) : null,
      endsAt: values.expires?.to ? toIsoDate(values.expires.to) : null,
      targets,
    };

    const callbacks = {
      onSuccess: () => {
        toast.success(t(isEdit ? "dialog.saved" : "dialog.created"));
        onOpenChange(false);
      },
      onError: () => toast.error(t("dialog.error")),
    };

    if (discountId != null) {
      updateDiscount.mutate({ id: discountId, ...input }, callbacks);
    } else {
      createDiscount.mutate(input, callbacks);
    }
  };

  return (
    /* trap-focus: skip base-ui's page scroll-lock — its inline `overflow: hidden` on <html>
       makes mobile emulation blow the layout viewport up to the page bounds, stretching
       every fixed overlay; the backdrop still covers the page. */
    <Dialog open={open} onOpenChange={onOpenChange} modal="trap-focus">
      {/* Mobile is a page, not a modal (973:99981): the popup fills everything below the
          72px navbar with no dimming, shadow or radius, and the whole column — X row,
          title, fields, submit — scrolls as one flow. From md up it reverts to the
          centered 688px dialog with the dimmed backdrop. */}
      <DialogContent
        showClose
        mobileSheet
        backdropClassName="max-md:bg-transparent"
        className="top-18 gap-0 overflow-y-auto rounded-none p-0 pb-0 shadow-none [scrollbar-width:thin] md:top-1/2 md:max-h-[calc(100dvh-53px)] md:max-w-[min(688px,calc(100vw-108px))] md:overflow-hidden md:rounded-2xl md:pb-0 md:shadow-[4px_4px_20px_rgba(0,0,0,0.1)] [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:md:hidden"
      >
        {/* Own header row: the mobile sheet centers the title under its X row and draws no
            band separators (973:99240); from md the title is left-aligned over a hairline. */}
        {/* Mobile (973:99174): X row 40px (icon at y8), 20px Bold centered title at y56,
            16px to the first field — the fields wrapper's own p-4 provides that gap. */}
        <div className="w-full shrink-0 border-b-0 border-natural-50 px-4 pt-14 pb-0 md:border-b md:p-5">
          <DialogTitle className="text-center text-xl font-bold md:text-left md:text-2xl md:font-semibold">
            {t(isEdit ? "dialog.editTitle" : "dialog.createTitle")}
          </DialogTitle>
        </div>

        {isEdit && discountQuery.isError ? (
          <div className="p-4 md:p-5">
            <p className="text-base leading-[1.4] text-foreground">{t("dialog.error")}</p>
          </div>
        ) : isEdit && discountQuery.isPending ? (
          <div className="p-4 md:p-5">
            <Loader />
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex w-full flex-col md:min-h-0 md:flex-1"
            >
              <div className="p-4 md:min-h-0 md:flex-1 md:overflow-y-auto md:p-5 md:[scrollbar-width:thin]">
                <div className="flex flex-col gap-4">
                  <div className="grid items-start gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("dialog.name.label")}</FormLabel>
                          <FormControl>
                            <TextField placeholder={t("dialog.name.placeholder")} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="code"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("dialog.code.label")}</FormLabel>
                          <FormControl>
                            <TextField placeholder={t("dialog.code.placeholder")} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid items-start gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="type"
                      render={({ field }) => (
                        <FormItem className="gap-3">
                          <FormLabel>{t("dialog.type.label")}</FormLabel>
                          <FormControl>
                            <RadioGroup
                              value={field.value}
                              onValueChange={(value) => {
                                const next = DISCOUNT_TYPES.find((option) => option === value);
                                if (next) field.onChange(next);
                              }}
                              className="gap-3"
                            >
                              {DISCOUNT_TYPES.map((option) => (
                                <label
                                  key={option}
                                  className="flex w-fit cursor-pointer items-center gap-3 text-base leading-[1.4] text-foreground"
                                >
                                  <Radio value={option} />
                                  {t(`type.${option}`)}
                                </label>
                              ))}
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="value"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("dialog.price.label")}</FormLabel>
                          <FormControl>
                            <TextField
                              type="number"
                              inputMode="decimal"
                              min={0}
                              placeholder={t("dialog.price.placeholder")}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid items-start gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="expires"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("dialog.expiration.label")}</FormLabel>
                          <DatePicker
                            mode="range"
                            value={field.value}
                            onValueChange={field.onChange}
                            placeholder={t("dialog.expiration.placeholder")}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="usageLimit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("dialog.usageLimit.label")}</FormLabel>
                          <FormControl>
                            <TextField
                              type="number"
                              inputMode="numeric"
                              min={1}
                              step={1}
                              placeholder={t("dialog.usageLimit.placeholder")}
                              supportingText={t("dialog.usageLimit.hint")}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="appliesTo"
                    render={({ field }) => (
                      <FormItem className="gap-3">
                        <FormLabel>{t("dialog.appliesTo.label")}</FormLabel>
                        {/* Figma lays these out as a wrapping flex row with natural widths
                            (4+3 at ≥768, 2-per-row at 390), not a fixed grid. */}
                        <div className="flex flex-wrap gap-3">
                          {APPLIES_TO_OPTIONS.map((option) => (
                            <label
                              key={option}
                              className="flex w-fit cursor-pointer items-center gap-3 text-base leading-[1.4] text-foreground"
                            >
                              <Checkbox
                                checked={field.value.includes(option)}
                                onCheckedChange={(checked) =>
                                  field.onChange(toggle(field.value, option, checked))
                                }
                              />
                              {t(`applies.${option}`)}
                            </label>
                          ))}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {showSpecific ? (
                    <FormField
                      control={form.control}
                      name="specificYachts"
                      render={({ field }) => (
                        <FormItem className="gap-2">
                          <TextField
                            startIcon={<Search />}
                            placeholder={t("dialog.search.placeholder")}
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                          />
                          {/* 48px rows on a 56px pitch (8px Figma gaps), 384px visible window. */}
                          <div className="flex max-h-[384px] flex-col gap-2 overflow-y-auto [scrollbar-width:thin]">
                            {visibleYachts.map((option) => (
                              <label
                                key={option.id}
                                className="flex h-12 shrink-0 cursor-pointer items-center gap-3 border-b border-natural-50 text-base leading-[1.4] text-foreground last:border-b-0"
                              >
                                <Checkbox
                                  checked={field.value.includes(option.id)}
                                  onCheckedChange={(checked) =>
                                    field.onChange(toggle(field.value, option.id, checked))
                                  }
                                />
                                {option.title}
                              </label>
                            ))}
                          </div>
                        </FormItem>
                      )}
                    />
                  ) : null}
                </div>
              </div>

              <div className="flex w-full shrink-0 flex-col gap-4 border-t-0 border-natural-50 p-4 md:border-t md:p-5">
                {/* Its own audited action, not part of the form: switching it off has to stop
                    the code being redeemed now, without waiting for Save. */}
                {isEdit && discount ? (
                  <label className="flex w-full cursor-pointer items-center justify-between gap-3 text-base leading-[1.4] text-foreground">
                    {t("dialog.active.label")}
                    <Switch
                      checked={discount.active}
                      disabled={setActive.isPending}
                      onCheckedChange={(checked) =>
                        setActive.mutate(
                          { id: discount.id, active: checked },
                          {
                            onSuccess: () =>
                              toast.success(t(checked ? "dialog.active.on" : "dialog.active.off")),
                            onError: () => toast.error(t("dialog.error")),
                          },
                        )
                      }
                    />
                  </label>
                ) : null}
                <Button
                  type="submit"
                  variant="brand"
                  size="md"
                  className="w-full"
                  disabled={pending}
                >
                  {t(isEdit ? "dialog.submitSave" : "dialog.submitCreate")}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
