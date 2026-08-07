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
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { Dialog, DialogContent, DialogTitle } from "@yacht-charter/ui/components/overlay/dialog";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import DatePicker from "@/components/shared/form/date-picker";

import {
  APPLIES_TO_OPTIONS,
  type Discount,
  type DiscountAppliesTo,
  type DiscountType,
  SPECIFIC_YACHT_OPTIONS,
} from "../lib/discounts";

/*
 * DiscountDialog — the Create/Edit discount modal of /profile/discounts.
 * Figma "Discount & Price Manager": create 972:55119 (+ Specific Yachts state 972:55323),
 * edit 972:55221; tablet 973:101833; mobile 973:99174-range frames.
 * 688px modal, 20px section paddings, 16px field gaps, 316px half-width fields; the title
 * and the submit button sit in fixed bands with separators and only the field area scrolls.
 * Contract: `discount` null/undefined → create mode; a Discount → edit mode (prefilled).
 */

const DISCOUNT_TYPES: DiscountType[] = ["percentage", "fixed"];

function useDiscountSchema() {
  const t = useTranslations("Discounts.dialog.errors");

  return useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("nameRequired")),
        code: z.string().min(1, t("codeRequired")),
        type: z.enum(["percentage", "fixed"]),
        /* Kept as a string so the input round-trips; positivity checked on the parsed number. */
        value: z
          .string()
          .min(1, t("priceRequired"))
          .refine((value) => Number(value) > 0, t("priceRequired")),
        expires: z.custom<DateRange>().optional(),
        appliesTo: z.array(z.custom<DiscountAppliesTo>()),
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
      /* The Figma create state opens with "All yachts" pre-checked. */
      appliesTo: ["allYachts"],
      specificYachts: [],
    };
  }

  return {
    name: discount.name,
    code: discount.code,
    type: discount.type,
    value: String(discount.value),
    expires: discount.expires
      ? { from: new Date(discount.expires.from), to: new Date(discount.expires.to) }
      : undefined,
    appliesTo: [discount.appliesTo],
    specificYachts: [],
  };
}

/** Immutable membership toggle for the checkbox-array fields. */
function toggle<T>(list: T[], item: T, present: boolean): T[] {
  return present ? [...list, item] : list.filter((entry) => entry !== item);
}

export default function DiscountDialog({
  open,
  onOpenChange,
  discount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discount?: Discount | null;
}) {
  const t = useTranslations("Discounts");
  const isEdit = Boolean(discount);
  const [search, setSearch] = useState("");

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

  const query = search.trim().toLowerCase();
  const visibleYachts = SPECIFIC_YACHT_OPTIONS.filter((key) =>
    t(`yachtTypes.${key}`).toLowerCase().includes(query),
  );

  const onSubmit = (values: Values) => {
    /* Persistence lands with the discounts API; until then submitting only acknowledges. */
    void values;
    toast.success(t(isEdit ? "dialog.saved" : "dialog.created"));
    onOpenChange(false);
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
                            onValueChange={(value) => field.onChange(value as DiscountType)}
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
                          {visibleYachts.map((key) => (
                            <label
                              key={key}
                              className="flex h-12 shrink-0 cursor-pointer items-center gap-3 border-b border-natural-50 text-base leading-[1.4] text-foreground last:border-b-0"
                            >
                              <Checkbox
                                checked={field.value.includes(key)}
                                onCheckedChange={(checked) =>
                                  field.onChange(toggle(field.value, key, checked))
                                }
                              />
                              {t(`yachtTypes.${key}`)}
                            </label>
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />
                ) : null}
              </div>
            </div>

            <div className="w-full shrink-0 border-t-0 border-natural-50 p-4 md:border-t md:p-5">
              <Button type="submit" variant="brand" size="md" className="w-full">
                {t(isEdit ? "dialog.submitSave" : "dialog.submitCreate")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
