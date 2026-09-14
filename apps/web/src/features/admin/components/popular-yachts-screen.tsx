"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { Input } from "@yacht-charter/ui/components/form/input";
import { Textarea } from "@yacht-charter/ui/components/form/textarea";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import Sidebar from "@/components/layout/sidebar";
import { useFilterOptions } from "@/components/shared/form/filters";
import AppBreadcrumbs from "@/components/shared/navigation/app-breadcrumbs";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

import {
  usePopularYachtsConfig,
  useUpdatePopularYachtsConfig,
} from "../hooks/use-popular-yachts-config";

interface PopularYachtsScreenProps {
  user: { name: string; email: string };
}

type PopularDestinations = { country: string; places: string[] }[];

interface FormState {
  /* The four numbers, typed as an operator enters them; parsed at the edges only. */
  limit: string;
  maxAgeYears: string;
  maxPerCountry: string;
  maxPerBase: string;
  /* Boat-type filter value to how many of that type the slider aims for. A type at nought is
     kept rather than dropped, so an operator can zero one out and put it back. */
  mix: Record<string, number>;
  /* One country per line, "Croatia: Split / Trogir; Zadar". Parsed at the edges only. */
  destinations: string;
}

/*
 * PopularYachtsScreen for /popular-yachts: how the home page's popular-yachts slider is
 * composed. Same shell as the other website-content screens.
 */
export default function PopularYachtsScreen({ user }: PopularYachtsScreenProps) {
  const t = useTranslations("Admin.PopularYachts");
  const router = useRouter();
  const { data, isPending } = usePopularYachtsConfig();
  const update = useUpdatePopularYachtsConfig();

  const [form, setForm] = useState<FormState | null>(null);

  /* Seeded from the server's answer, and again after a save. Query results are structurally
     shared, so a background refetch of an unchanged row keeps `data` and an edit in progress. */
  useEffect(() => {
    if (!data) return;
    setForm({
      limit: String(data.limit),
      maxAgeYears: String(data.maxAgeYears),
      maxPerCountry: String(data.maxPerCountry),
      maxPerBase: String(data.maxPerBase),
      mix: data.mix,
      destinations: formatDestinations(data.destinations),
    });
  }, [data]);

  const logout = () => authClient.signOut({ fetchOptions: { onSuccess: () => router.push("/") } });

  const { options: facetOptions } = useFilterOptions();

  /* Bounded exactly as `popularYachtsConfigSchema` is, so a figure this screen accepts is one
     the save will accept -- an out-of-range number reaching the contract comes back as an
     unlabelled validation error rather than beside the field that caused it. */
  const numbers = {
    limit: Number(form?.limit),
    maxAgeYears: Number(form?.maxAgeYears),
    maxPerCountry: Number(form?.maxPerCountry),
    maxPerBase: Number(form?.maxPerBase),
  };
  const destinations = parseDestinations(form?.destinations ?? "");
  const within = (value: number, min: number, max: number) =>
    Number.isInteger(value) && value >= min && value <= max;
  const canSave =
    form !== null &&
    within(numbers.limit, 1, 48) &&
    within(numbers.maxAgeYears, 0, 50) &&
    within(numbers.maxPerCountry, 1, 48) &&
    within(numbers.maxPerBase, 1, 48) &&
    destinations.length <= 48 &&
    destinations.every((destination) => destination.places.length <= 48) &&
    !update.isPending;

  const save = () => {
    if (!form || !canSave) return;
    update.mutate(
      { ...numbers, mix: form.mix, destinations },
      {
        /* A save reaches the database before it reaches the web app's cache, and only the second
           half can fail. Saying so beats a bare success on a home page that has not moved. */
        onSuccess: (result) => {
          const fresh = result.cache.ok || !result.cache.attempted;
          toast[fresh ? "success" : "warning"](fresh ? t("saved") : t("cacheWarning"));
        },
        onError: () => toast.error(t("saveFailed")),
      },
    );
  };

  /*
   * The boat types a mix may name: whatever the catalogue currently carries, plus any type
   * already in the saved mix.
   *
   * Both halves matter. Offering only the live vocabulary would hide a quota for a type the
   * fleet has temporarily none of, and editing the config would then silently drop it; offering
   * only the saved keys would mean a new hull type could never be given one. Free text is not an
   * option at all -- a mistyped key is a quota that matches nothing and says nothing.
   */
  const mixRows = (() => {
    const seen = new Set<string>();
    const rows: { value: string; label: string }[] = [];
    for (const option of facetOptions.boatTypes) {
      seen.add(option.value);
      rows.push({ value: option.value, label: option.label });
    }
    for (const value of Object.keys(form?.mix ?? {})) {
      if (!seen.has(value)) rows.push({ value, label: value });
    }
    return rows;
  })();

  const set = (patch: Partial<FormState>) =>
    setForm((current) => (current ? { ...current, ...patch } : current));

  return (
    <div className="flex flex-col">
      <AppBreadcrumbs items={[]} backLabel="Profile.home" backHref="/" />

      <div className="mx-auto w-full max-w-384 px-4 py-6 md:px-13.5 xl:px-17.5">
        <div className="mx-auto grid max-w-349 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[--spacing(83.5)_minmax(0,1fr)] lg:items-start">
          <Sidebar
            name={user.name}
            variant="admin"
            defaultActive="popularYachts"
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
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <NumberField
                    label={t("limit")}
                    value={form.limit}
                    onChange={(next) => set({ limit: next })}
                  />
                  <NumberField
                    label={t("maxAgeYears")}
                    value={form.maxAgeYears}
                    onChange={(next) => set({ maxAgeYears: next })}
                  />
                  <NumberField
                    label={t("maxPerCountry")}
                    value={form.maxPerCountry}
                    onChange={(next) => set({ maxPerCountry: next })}
                  />
                  <NumberField
                    label={t("maxPerBase")}
                    value={form.maxPerBase}
                    onChange={(next) => set({ maxPerBase: next })}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-sm leading-4.5 font-medium text-foreground">
                    {t("mix")}
                  </span>
                  <p className="text-xs leading-4 font-medium text-natural-500">{t("mixHint")}</p>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {mixRows.map((row) => (
                      <NumberField
                        key={row.value}
                        label={row.label}
                        value={String(form.mix[row.value] ?? 0)}
                        onChange={(next) =>
                          set({
                            mix: {
                              ...form.mix,
                              [row.value]: Math.max(0, Math.trunc(Number(next) || 0)),
                            },
                          })
                        }
                      />
                    ))}
                  </div>
                </div>

                <label className="flex flex-col gap-2">
                  <span className="text-sm leading-4.5 font-medium text-foreground">
                    {t("destinations")}
                  </span>
                  <span className="text-xs leading-4 font-medium text-natural-500">
                    {t("destinationsHint")}
                  </span>
                  <Textarea
                    className="min-h-32 font-mono"
                    value={form.destinations}
                    onChange={(event) => set({ destinations: event.target.value })}
                  />
                </label>

                <div>
                  <Button type="button" onClick={save} disabled={!canSave}>
                    {update.isPending ? t("saving") : t("save")}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function formatDestinations(destinations: PopularDestinations): string {
  return destinations
    .map(({ country, places }) =>
      places.length > 0 ? `${country}: ${places.join("; ")}` : country,
    )
    .join("\n");
}

/* Blank lines and empty places are skipped rather than refused: they are what a hand-edited list
   picks up, and the order of what is left is the priority the slider reads. */
function parseDestinations(text: string): PopularDestinations {
  return text.split("\n").flatMap((line) => {
    const [countryPart = "", ...rest] = line.split(":");
    const country = countryPart.trim();
    if (!country) return [];
    const places = rest
      .join(":")
      .split(";")
      .map((place) => place.trim())
      .filter(Boolean);
    return [{ country, places }];
  });
}

interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

/* A labelled whole-number box. The four caps and every mix quota are the same control. */
function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs leading-4 font-medium text-natural-500">{label}</span>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
