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
import { Select } from "@yacht-charter/ui/components/form/select";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
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
  useCommissionOperatorOptions,
  useCreateCommission,
  useUpdateCommission,
} from "../hooks/use-commissions";
import type { CommissionRow, ProviderKey } from "../types";

/*
 * One negotiated rate: which vendor, optionally which operator, how much, and from when.
 *
 * The rate is typed as a percentage because that is how it is agreed out loud and how it is
 * stored. The window is optional at both ends, since most agreements run until somebody
 * renegotiates them rather than to a date.
 *
 * Overlaps are refused by the server rather than here: only it can see the other rates.
 */

const PROVIDERS: readonly ProviderKey[] = ["booking_manager", "nausys", "mock"];

/* Sentinel for "every operator at this vendor" — an empty Select value shows the placeholder. */
const ALL_OPERATORS = "all";

type Values = {
  provider: ProviderKey;
  operatorId: string;
  ratePct: string;
  startsAt: string;
  endsAt: string;
};

function toValues(rate: CommissionRow | null): Values {
  return {
    provider: rate?.provider ?? "nausys",
    operatorId: rate?.operatorId ?? ALL_OPERATORS,
    ratePct: rate ? String(rate.ratePct) : "",
    startsAt: rate?.startsAt ?? "",
    endsAt: rate?.endsAt ?? "",
  };
}

function useCommissionSchema() {
  const t = useTranslations("Admin.Commissions.dialog.errors");

  return useMemo(
    () =>
      z
        .object({
          provider: z.enum(["booking_manager", "nausys", "mock"]),
          operatorId: z.string(),
          /* Typed, so it arrives as text and the message has to be ours rather than Zod's
             "expected number, received nan", which tells an editor nothing. */
          ratePct: z
            .string()
            .trim()
            .min(1, t("rateRequired"))
            .refine((value) => {
              const rate = Number(value);
              return Number.isFinite(rate) && rate >= 0 && rate <= 100;
            }, t("rateRange")),
          startsAt: z.string(),
          endsAt: z.string(),
        })
        .superRefine((values, ctx) => {
          if (values.startsAt && values.endsAt && values.endsAt < values.startsAt) {
            ctx.addIssue({ code: "custom", message: t("endsBeforeStarts"), path: ["endsAt"] });
          }
        }),
    [t],
  );
}

interface CommissionDialogProps {
  rate: CommissionRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommissionDialog({ rate, open, onOpenChange }: CommissionDialogProps) {
  const t = useTranslations("Admin.Commissions");
  const tProviders = useTranslations("Admin.providers");
  const isEdit = rate !== null;

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const createRate = useCreateCommission();
  const updateRate = useUpdateCommission();
  const pending = createRate.isPending || updateRate.isPending;

  const schema = useCommissionSchema();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(rate),
    mode: "onTouched",
  });

  /* Re-prefilled on every open, so a cancelled edit never leaks into the next one. */
  useEffect(() => {
    if (!open) return;
    form.reset(toValues(rate));
    setSearch("");
  }, [open, rate, form]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const operatorOptions = useCommissionOperatorOptions(debouncedSearch);
  const selectedOperatorId = form.watch("operatorId");

  /*
   * The operator being edited may not be in the search results, and a Select whose value has no
   * matching item falls back to its placeholder — which would read as "every operator" and quietly
   * widen the rate on the next save.
   */
  const operatorChoices = [
    { value: ALL_OPERATORS, label: t("dialog.allOperators") },
    ...(rate?.operatorId && rate.operatorName
      ? [{ value: rate.operatorId, label: rate.operatorName }]
      : []),
    ...(operatorOptions.data?.items ?? [])
      .filter((option) => option.id !== rate?.operatorId)
      .map((option) => ({ value: option.id, label: option.name })),
  ];

  const submit = form.handleSubmit((values) => {
    const payload = {
      provider: values.provider,
      operatorId: values.operatorId === ALL_OPERATORS ? null : values.operatorId,
      ratePct: Number(values.ratePct),
      startsAt: values.startsAt || null,
      endsAt: values.endsAt || null,
    };

    const done = {
      onSuccess: () => {
        toast.success(isEdit ? t("updated") : t("created"));
        onOpenChange(false);
      },
      onError: (error: Error) => toast.error(error.message),
    };

    if (isEdit) updateRate.mutate({ id: rate.id, ...payload }, done);
    else createRate.mutate(payload, done);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-125">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("dialog.editTitle") : t("dialog.createTitle")}</DialogTitle>
          <DialogDescription>{t("dialog.description")}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="provider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dialog.provider")}</FormLabel>
                  <FormControl>
                    <Select
                      className="h-12"
                      ariaLabel={t("dialog.provider")}
                      value={field.value}
                      onValueChange={field.onChange}
                      options={PROVIDERS.map((key) => ({ value: key, label: tProviders(key) }))}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="operatorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dialog.operator")}</FormLabel>
                  <TextField
                    fieldClassName="h-12"
                    value={search}
                    startIcon={<Search />}
                    placeholder={t("dialog.operatorSearch")}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  <FormControl>
                    <Select
                      className="h-12"
                      ariaLabel={t("dialog.operator")}
                      value={selectedOperatorId}
                      onValueChange={field.onChange}
                      options={operatorChoices}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ratePct"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("dialog.ratePct")}</FormLabel>
                  <FormControl>
                    <TextField
                      fieldClassName="h-12"
                      inputMode="decimal"
                      placeholder="15"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dialog.startsAt")}</FormLabel>
                    <FormControl>
                      <TextField fieldClassName="h-12" type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endsAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("dialog.endsAt")}</FormLabel>
                    <FormControl>
                      <TextField fieldClassName="h-12" type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <p className="text-sm leading-[1.3] text-natural-500">{t("dialog.windowHint")}</p>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
                {t("dialog.cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t("dialog.saving") : t("dialog.save")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
