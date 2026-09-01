"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Input } from "@yacht-charter/ui/components/form/input";
import { Label } from "@yacht-charter/ui/components/form/label";
import { Radio, RadioGroup } from "@yacht-charter/ui/components/form/radio";
import { Switch } from "@yacht-charter/ui/components/form/switch";
import { cn } from "@yacht-charter/ui/lib/utils";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import Sidebar from "@/components/layout/sidebar";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

import {
  useMarketplaceSettings,
  useUpdateMarketplaceSettings,
} from "../hooks/use-marketplace-settings";

type PaymentSource = "vendor" | "marketplace";
type PaymentMode = "deposit" | "full";

interface FormState {
  source: PaymentSource;
  mode: PaymentMode;
  /* The percentage as an operator types it (50, not 0.5); converted at the edges only. */
  depositPercent: string;
  enforceLeadTime: boolean;
  leadTimeDays: string;
}

const PRESET_PERCENTS = ["30", "50", "100"] as const;

/**
 * Settings for /settings: the payment flow every quote is priced on.
 *
 * The two flows are radio buttons rather than a set of independent switches because they are
 * genuinely exclusive - "the provider's plan" and "ours" are two answers to one question, and
 * a screen that let both be on at once would be describing a state the pricing code cannot
 * represent. The fields belonging to a flow are disabled while the other one is selected, so
 * what is in force is never ambiguous.
 */
export default function SettingsScreen({ user }: { user: { name: string; email: string } }) {
  const t = useTranslations("Admin.Settings");
  const router = useRouter();
  const { data, isPending } = useMarketplaceSettings();
  const update = useUpdateMarketplaceSettings();

  const [form, setForm] = useState<FormState | null>(null);

  /* The server's answer seeds the form once it lands; edits in flight are never overwritten by
     a background refetch, which is why this keys on the row's own `updatedAt`. */
  useEffect(() => {
    if (!data) return;
    setForm({
      source: data.payment.source,
      mode: data.payment.mode,
      depositPercent: String(Math.round(data.payment.depositPct * 100)),
      enforceLeadTime: data.payment.enforceLeadTime,
      leadTimeDays: String(data.payment.leadTimeDays),
    });
  }, [data?.updatedAt, data]);

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  const percent = Number(form?.depositPercent);
  const days = Number(form?.leadTimeDays);
  const percentValid = Number.isFinite(percent) && percent >= 1 && percent <= 100;
  const daysValid = Number.isInteger(days) && days >= 0 && days <= 365;
  /* A percentage only has to be valid when it is the one in force; an unused field left blank
     is not a reason to refuse a save of the vendor flow. */
  const canSave =
    form !== null &&
    daysValid &&
    (form.source === "vendor" || form.mode === "full" || percentValid) &&
    !update.isPending;

  const save = () => {
    if (!form || !canSave) return;
    update.mutate(
      {
        payment: {
          source: form.source,
          mode: form.mode,
          depositPct: percentValid ? percent / 100 : 0.5,
          enforceLeadTime: form.enforceLeadTime,
          leadTimeDays: days,
        },
      },
      {
        onSuccess: () => toast.success(t("saved")),
        onError: () => toast.error(t("saveFailed")),
      },
    );
  };

  const set = (patch: Partial<FormState>) =>
    setForm((current) => (current ? { ...current, ...patch } : current));

  const marketplaceSelected = form?.source === "marketplace";

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="px-4 py-6 md:px-13.5">
        <div className="mx-auto grid max-w-349 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[334px_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            variant="admin"
            defaultActive="settings"
            onLogout={logout}
            className="max-w-none"
          />

          <section className="overflow-hidden rounded-2xl border border-natural-100 bg-card">
            <div className="flex flex-col gap-2 border-b border-natural-50 px-4 py-5 md:p-5">
              <h1 className="text-lg leading-[1.3] font-bold text-foreground md:text-xl">
                {t("title")}
              </h1>
              <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("subtitle")}</p>
            </div>

            {isPending || !form ? (
              <div className="flex flex-col gap-4 p-4 md:p-5">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <div className="flex flex-col gap-6 p-4 md:p-5">
                <fieldset className="flex flex-col gap-3">
                  <legend className="mb-3 text-sm leading-4.5 font-bold text-foreground">
                    {t("source.legend")}
                  </legend>

                  {/*
                    Base UI's RadioGroup is a composite and cannot contain another one, so the
                    mode radios sit outside this group rather than inside the card they belong
                    to. Nesting them rendered fine and silently swallowed every click on the
                    outer group.
                  */}
                  <RadioGroup
                    value={form.source}
                    onValueChange={(value) => {
                      if (value === "vendor" || value === "marketplace") set({ source: value });
                    }}
                    className="gap-3"
                  >
                    <FlowOption
                      value="vendor"
                      selected={form.source === "vendor"}
                      title={t("source.vendor.title")}
                      hint={t("source.vendor.hint")}
                    />
                    <FlowOption
                      value="marketplace"
                      selected={marketplaceSelected}
                      title={t("source.marketplace.title")}
                      hint={t("source.marketplace.hint")}
                    />
                  </RadioGroup>

                  {/* Inert until our own policy is chosen: these numbers do nothing at all
                      while the provider's schedule is in force. */}
                  <div
                    className={cn(
                      "flex flex-col gap-3 rounded-xl border border-natural-100 p-4",
                      marketplaceSelected ? "" : "pointer-events-none opacity-50",
                    )}
                    aria-hidden={!marketplaceSelected}
                  >
                    <RadioGroup
                      value={form.mode}
                      onValueChange={(value) => {
                        if (value === "deposit" || value === "full") set({ mode: value });
                      }}
                      className="flex-row gap-4"
                    >
                      <label className="flex cursor-pointer items-center gap-2 text-sm leading-4.5 font-medium text-foreground">
                        <Radio value="deposit" disabled={!marketplaceSelected} />
                        {t("ourPolicy.deposit")}
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm leading-4.5 font-medium text-foreground">
                        <Radio value="full" disabled={!marketplaceSelected} />
                        {t("ourPolicy.full")}
                      </label>
                    </RadioGroup>

                    {form.mode === "deposit" ? (
                      <div className="flex flex-col gap-2">
                        <Label htmlFor="deposit-percent">{t("ourPolicy.percentLabel")}</Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            id="deposit-percent"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={100}
                            value={form.depositPercent}
                            disabled={!marketplaceSelected}
                            onChange={(event) => set({ depositPercent: event.target.value })}
                            className="w-28"
                            aria-invalid={!percentValid}
                          />
                          <span className="text-sm leading-4.5 font-medium text-natural-500">
                            %
                          </span>
                          {PRESET_PERCENTS.map((preset) => (
                            <Button
                              key={preset}
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!marketplaceSelected}
                              onClick={() => set({ depositPercent: preset })}
                            >
                              {preset}%
                            </Button>
                          ))}
                        </div>
                        {marketplaceSelected && !percentValid ? (
                          <p className="text-xs leading-4 font-medium text-error-600">
                            {t("ourPolicy.percentError")}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </fieldset>

                <fieldset className="flex flex-col gap-3 rounded-xl border border-natural-100 p-4">
                  <legend className="px-1 text-sm leading-4.5 font-bold text-foreground">
                    {t("leadTime.legend")}
                  </legend>

                  <label className="flex items-start justify-between gap-4">
                    <span className="flex flex-col gap-1">
                      <span className="text-sm leading-4.5 font-medium text-foreground">
                        {t("leadTime.toggle")}
                      </span>
                      <span className="text-xs leading-4 font-medium text-natural-500">
                        {t("leadTime.hint")}
                      </span>
                    </span>
                    <Switch
                      checked={form.enforceLeadTime}
                      onCheckedChange={(checked) => set({ enforceLeadTime: checked })}
                    />
                  </label>

                  <div className="flex flex-col gap-2">
                    <Label htmlFor="lead-time-days">{t("leadTime.daysLabel")}</Label>
                    <Input
                      id="lead-time-days"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={365}
                      value={form.leadTimeDays}
                      disabled={!form.enforceLeadTime}
                      onChange={(event) => set({ leadTimeDays: event.target.value })}
                      className="w-28"
                      aria-invalid={!daysValid}
                    />
                    {daysValid ? null : (
                      <p className="text-xs leading-4 font-medium text-error-600">
                        {t("leadTime.daysError")}
                      </p>
                    )}
                  </div>
                </fieldset>

                <div className="flex items-center gap-3">
                  <Button type="button" onClick={save} disabled={!canSave}>
                    {update.isPending ? t("saving") : t("save")}
                  </Button>
                  <p className="text-xs leading-4 font-medium text-natural-500">
                    {t("appliesNext")}
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/** One flow, as a card that carries whatever fields belong to it. */
function FlowOption({
  value,
  selected,
  title,
  hint,
}: {
  value: PaymentSource;
  selected: boolean;
  title: string;
  hint: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        selected ? "border-brand bg-brand-50/40" : "border-natural-100",
      )}
    >
      <label className="flex cursor-pointer items-start gap-3">
        <Radio value={value} className="mt-0.5" />
        <span className="flex flex-col gap-1">
          <span className="text-sm leading-4.5 font-bold text-foreground">{title}</span>
          <span className="text-xs leading-4 font-medium text-natural-500">{hint}</span>
        </span>
      </label>
    </div>
  );
}
