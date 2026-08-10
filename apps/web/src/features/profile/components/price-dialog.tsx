"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@yacht-charter/ui/components/form/form";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { Dialog, DialogContent, DialogTitle } from "@yacht-charter/ui/components/overlay/dialog";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import z from "zod";

import Loader from "@/components/shared/feedback/loader";
import { useMoney } from "@/hooks/use-money";

import { useListingPrices, useUpdateListingPrice } from "../hooks/use-discounts";

/*
 * PriceDialog — the "Edit Price" modal of /profile/discounts (Manage Prices tab).
 * Figma: desktop 972:55508 / tablet 973:106689 / mobile 973:108361.
 * 472px modal in three 20px-padded bands split by separators: title (24px title over the
 * yacht name as a 16px bold brand link with a dotted underline, 8px apart), the two price
 * fields at 16px gaps, and the full-width 48px Update button. Base Price is the provider's
 * read-only price rendered at 50% opacity in placeholder grey; New Price is the override,
 * submitted to `admin.listingPrice.update` in minor units.
 * Mobile is the bottom sheet with the built-in X above the title.
 * Contract: `listingId` is the row being edited; while it resolves the shell shows the
 * shared loader, and an unknown id renders the list error copy.
 */

type Values = { newPrice: string };

export default function PriceDialog({
  open,
  onOpenChange,
  listingId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listingId: string;
}) {
  const t = useTranslations("Discounts");
  const formatMoney = useMoney();

  /* No admin.listingPrice.get exists yet, so the row comes out of a one-page list fetch —
   * mirroring prefetchListingPrices in ../api/server.ts. Swap for a get-by-id once the API
   * grows one. */
  const { data, isPending } = useListingPrices({ page: 1, pageSize: 100 });
  const row = data?.items.find((item) => item.listingId === listingId);

  const updatePrice = useUpdateListingPrice();

  /* Memoised so the translated schema keeps one identity per locale — a new identity
   * every render would re-register the resolver. */
  const schema = useMemo(
    () =>
      z.object({
        newPrice: z
          .string()
          .min(1, t("prices.dialog.errors.priceRequired"))
          /* The input is a number of euros; reuse the required-message for a non-number. */
          .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
            message: t("prices.dialog.errors.priceRequired"),
          }),
      }),
    [t],
  );

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { newPrice: "" },
    mode: "onTouched",
  });

  /* Clear on every open and whenever another row is picked while mounted, so a dirty
   * cancel or a row switch never leaks the previous draft. */
  useEffect(() => {
    if (!open) return;
    form.reset({ newPrice: "" });
  }, [open, listingId, form]);

  const onSubmit = (values: Values) => {
    if (!row) return;
    updatePrice.mutate(
      {
        listingId,
        newPriceMinor: Math.round(Number(values.newPrice) * 100),
        currency: row.basePrice?.currency ?? row.currentPrice?.currency ?? "EUR",
      },
      {
        onSuccess: () => {
          toast.success(t("prices.dialog.updated"));
          onOpenChange(false);
        },
        onError: () => toast.error(t("dialog.error")),
      },
    );
  };

  return (
    /* trap-focus: skip base-ui's page scroll-lock — its inline `overflow: hidden` on <html>
       makes mobile emulation blow the layout viewport up to the page bounds, stretching
       every fixed overlay; the backdrop still covers the page. */
    <Dialog open={open} onOpenChange={onOpenChange} modal="trap-focus">
      <DialogContent
        showClose
        mobileSheet
        className="max-h-[calc(100dvh-3rem)] gap-0 overflow-hidden p-0 pb-0 md:max-w-[min(472px,calc(100vw-108px))] md:rounded-2xl md:pb-0 [&_[data-slot=dialog-close]]:md:hidden"
      >
        {/* Own header row: left-aligned title with the yacht name underneath and a
            separator below, unlike the centered DialogHeader. On mobile the built-in X
            sits above it. */}
        <div className="w-full shrink-0 border-b-0 border-natural-50 px-4 pt-14 pb-4 md:border-b md:p-5">
          <DialogTitle className="text-xl md:text-2xl">{t("prices.dialog.title")}</DialogTitle>
          {/* Figma "m-link" run: 16px bold brand blue with a dotted underline. Plain text
              until the yacht detail route is wired to this row. */}
          <p className="mt-2 text-base leading-[1.4] font-bold text-brand underline decoration-dotted [text-decoration-skip-ink:none]">
            {row?.title}
          </p>
        </div>

        {isPending ? (
          /* Row still resolving — keep the shell and show the shared loader in the body. */
          <div className="min-h-0 w-full flex-1 overflow-y-auto p-4 md:p-5">
            <Loader />
          </div>
        ) : !row ? (
          /* Loaded but the id is not in the catalogue page — the list error copy. */
          <div className="w-full p-4 pb-6 md:p-5">
            <p className="text-center text-sm font-medium text-natural-500">{t("prices.error")}</p>
          </div>
        ) : (
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex min-h-0 w-full flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-width:thin] md:p-5">
                <div className="flex flex-col gap-4">
                  {/* Current provider price — display only, so it stays out of the form.
                      The design dims the whole field to 50% and greys the value like a
                      placeholder. */}
                  <TextField
                    label={t("prices.dialog.basePrice")}
                    value={row.basePrice ? formatMoney(row.basePrice.amountMinor) : "—"}
                    readOnly
                    tabIndex={-1}
                    containerClassName="opacity-50"
                    className="text-natural-300"
                  />

                  <FormField
                    control={form.control}
                    name="newPrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("prices.dialog.newPrice")}</FormLabel>
                        <FormControl>
                          <TextField
                            inputMode="decimal"
                            placeholder={t("prices.dialog.newPricePlaceholder")}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="w-full shrink-0 border-t-0 border-natural-50 p-4 pb-6 md:border-t md:p-5">
                <Button
                  type="submit"
                  variant="brand"
                  size="md"
                  className="w-full"
                  disabled={updatePrice.isPending}
                >
                  {t("prices.dialog.submit")}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
