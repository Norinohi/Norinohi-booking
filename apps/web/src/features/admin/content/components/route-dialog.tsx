"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
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
import { perSiteLocaleValue, SITE_LOCALES } from "@yacht-charter/api/lib/locales";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";

import { useCreateRoute, useUpdateRoute, useUploadRouteImage } from "../hooks/use-routes";
import { ROUTE_KINDS, type RouteKind, type RouteRow } from "../types";
import PhotoField from "./photo-field";
import RouteTargetPicker, { type RouteTarget } from "./route-target-picker";

/*
 * The route's own fields. Stops are a separate screen — an itinerary is authored on a map, not in
 * a modal with the rest of the metadata.
 *
 * `active` is deliberately absent here. Publishing is a decision taken once the stops exist, so it
 * is a row action and an editor action; the server refuses to publish a route with none.
 */

const ROUTE_LOCALES = SITE_LOCALES;
type RouteLocale = (typeof ROUTE_LOCALES)[number];
type Pane = { title: string; description: string };

const DIFFICULTIES = ["easy", "moderate", "advanced"] as const;
type Difficulty = (typeof DIFFICULTIES)[number];
/* The select needs a value for "not set"; it never reaches the server as a difficulty. */
const NO_DIFFICULTY = "none";

/* The shape the server accepts, checked here so the field can say so before a save is refused. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Draft = {
  target: RouteTarget;
  title: string;
  slug: string;
  kind: RouteKind;
  nights: string;
  description: string;
  sortOrder: string;
  difficulty: Difficulty | null;
  imageUrl: string;
  translations: Record<RouteLocale, Pane>;
};

const emptyPanes = () => perSiteLocaleValue<Pane>(() => ({ title: "", description: "" }));

const EMPTY: Draft = {
  target: { baseId: null, regionId: null },
  title: "",
  slug: "",
  kind: "seven_days",
  nights: "7",
  description: "",
  sortOrder: "0",
  difficulty: null,
  imageUrl: "",
  translations: emptyPanes(),
};

function toDraft(route: RouteRow | null): Draft {
  if (!route) return { ...EMPTY, translations: emptyPanes() };
  const translations = emptyPanes();
  for (const entry of route.translations) {
    translations[entry.locale] = {
      title: entry.title ?? "",
      description: entry.description ?? "",
    };
  }
  return {
    target: { baseId: route.baseId, regionId: route.regionId },
    title: route.title,
    slug: route.slug,
    kind: route.kind,
    nights: String(route.nights),
    description: route.description ?? "",
    sortOrder: String(route.sortOrder),
    difficulty: route.difficulty,
    imageUrl: route.imageUrl ?? "",
    translations,
  };
}

interface RouteDialogProps {
  /** Null opens the dialog in create mode. */
  route: RouteRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether this environment can store an uploaded photo; the URL field works either way. */
  imageUploadEnabled: boolean;
}

export default function RouteDialog({
  route,
  open,
  onOpenChange,
  imageUploadEnabled,
}: RouteDialogProps) {
  const t = useTranslations("Admin.Routes.dialog");
  const [locale, setLocale] = useState<RouteLocale>("en");
  const tKinds = useTranslations("Admin.Routes.kinds");
  const titleId = useId();
  const nightsId = useId();
  const sortId = useId();
  const descriptionId = useId();
  const slugId = useId();

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [targetError, setTargetError] = useState<string | null>(null);
  const createRoute = useCreateRoute();
  const updateRoute = useUpdateRoute();
  const uploadImage = useUploadRouteImage();

  const upload = (file: File | undefined) => {
    if (!file) return;
    uploadImage.mutate(
      { file },
      {
        onSuccess: ({ url }) => setDraft((previous) => ({ ...previous, imageUrl: url })),
        onError: (error) => toast.error(error.message || t("errors.upload")),
      },
    );
  };
  /* Reopening on a different row must not carry the previous route's fields over. */
  useEffect(() => {
    if (open) {
      setDraft(toDraft(route));
      setTargetError(null);
      setLocale("en");
    }
  }, [open, route]);

  const nights = Number(draft.nights);
  const sortOrder = Number(draft.sortOrder);
  const validNights = Number.isInteger(nights) && nights >= 1 && nights <= 28;
  const validSort = Number.isInteger(sortOrder) && sortOrder >= 0;
  const hasTarget = Boolean(draft.target.baseId) !== Boolean(draft.target.regionId);
  const slug = draft.slug.trim();
  /* Blank on a new route means "make it from the title"; an existing one always has one. */
  const validSlug = slug ? SLUG_PATTERN.test(slug) : !route;
  const slugMoved = Boolean(route) && validSlug && slug !== route?.slug;
  const canSubmit =
    draft.title.trim().length > 0 && validNights && validSort && hasTarget && validSlug;
  const pending = createRoute.isPending || updateRoute.isPending || uploadImage.isPending;

  const submit = async () => {
    if (!hasTarget) {
      setTargetError(t("errors.target"));
      return;
    }
    if (!canSubmit) return;

    const fields = {
      baseId: draft.target.baseId,
      regionId: draft.target.regionId,
      title: draft.title.trim(),
      slug: slug || undefined,
      kind: draft.kind,
      nights,
      description: draft.description.trim() || null,
      sortOrder,
      difficulty: draft.difficulty,
      imageUrl: draft.imageUrl.trim() || null,
      /* Every language is sent: a pane left blank withdraws that translation, and the site then
         falls back to the default copy above rather than showing an empty card. */
      translations: ROUTE_LOCALES.map((code) => ({
        locale: code,
        title: draft.translations[code].title.trim() || null,
        description: draft.translations[code].description.trim() || null,
      })),
    };

    try {
      if (route) {
        await updateRoute.mutateAsync({ id: route.id, ...fields });
        toast.success(t("updated", { title: fields.title }));
      } else {
        await createRoute.mutateAsync(fields);
        toast.success(t("created", { title: fields.title }));
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("errors.failed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        className="max-h-[85dvh] w-[92vw] max-w-172 items-stretch overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{route ? t("editTitle") : t("createTitle")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <div className="flex w-full flex-col gap-4 text-left">
          <RouteTargetPicker
            value={draft.target}
            currentLabel={route?.targetLabel}
            error={targetError ?? undefined}
            onChange={(target) => {
              setDraft((previous) => ({ ...previous, target }));
              setTargetError(null);
            }}
          />

          <TextField
            id={titleId}
            label={t("fields.title")}
            supportingText={t("fields.defaultHint")}
            fieldClassName="h-12"
            value={draft.title}
            placeholder={t("fields.titlePlaceholder")}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, title: event.target.value }))
            }
          />

          <TextField
            id={slugId}
            label={t("fields.slug")}
            fieldClassName="h-12"
            startIcon={<span className="text-sm text-natural-500">/routes/</span>}
            value={draft.slug}
            placeholder={route ? undefined : t("fields.slugPlaceholder")}
            status={validSlug ? "default" : "error"}
            supportingText={
              !validSlug
                ? t("errors.slug")
                : slugMoved
                  ? t("fields.slugMoved", { previous: `/routes/${route?.slug}` })
                  : route
                    ? t("fields.slugHint")
                    : t("fields.slugCreateHint")
            }
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, slug: event.target.value.toLowerCase() }))
            }
          />

          <div className="flex flex-col gap-4 md:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm leading-4.25 font-semibold text-foreground">
                {t("fields.kind")}
              </span>
              <Select
                className="h-12 min-w-0"
                ariaLabel={t("fields.kind")}
                value={draft.kind}
                onValueChange={(next) =>
                  setDraft((previous) => ({
                    ...previous,
                    kind: ROUTE_KINDS.find((kind) => kind === next) ?? previous.kind,
                  }))
                }
                options={ROUTE_KINDS.map((kind) => ({ value: kind, label: tKinds(kind) }))}
              />
            </div>

            <TextField
              id={nightsId}
              type="number"
              min={1}
              max={28}
              containerClassName="min-w-0 md:w-40"
              fieldClassName="h-12"
              label={t("fields.nights")}
              status={validNights ? "default" : "error"}
              supportingText={validNights ? undefined : t("errors.nights")}
              value={draft.nights}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, nights: event.target.value }))
              }
            />

            <TextField
              id={sortId}
              type="number"
              min={0}
              containerClassName="min-w-0 md:w-40"
              fieldClassName="h-12"
              label={t("fields.sortOrder")}
              supportingText={t("fields.sortOrderHint")}
              value={draft.sortOrder}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, sortOrder: event.target.value }))
              }
            />
          </div>

          <TextField
            id={descriptionId}
            multiline
            label={t("fields.description")}
            value={draft.description}
            placeholder={t("fields.descriptionPlaceholder")}
            onChange={(event) =>
              setDraft((previous) => ({ ...previous, description: event.target.value }))
            }
          />

          <div className="flex min-w-0 flex-col gap-1.5 md:w-1/2">
            <span className="text-sm leading-4.25 font-semibold text-foreground">
              {t("fields.difficulty")}
            </span>
            <Select
              className="h-12 min-w-0"
              ariaLabel={t("fields.difficulty")}
              value={draft.difficulty ?? NO_DIFFICULTY}
              onValueChange={(next) =>
                setDraft((previous) => ({
                  ...previous,
                  difficulty: DIFFICULTIES.find((level) => level === next) ?? null,
                }))
              }
              options={[
                { value: NO_DIFFICULTY, label: t("difficulty.none") },
                ...DIFFICULTIES.map((level) => ({
                  value: level,
                  label: t(`difficulty.${level}`),
                })),
              ]}
            />
          </div>

          <PhotoField
            label={t("fields.imageUrl")}
            hint={imageUploadEnabled ? t("fields.imageHint") : t("fields.imageUrlHint")}
            alt={draft.title}
            value={draft.imageUrl}
            onChange={(imageUrl) => setDraft((previous) => ({ ...previous, imageUrl }))}
            uploading={uploadImage.isPending}
            uploadLabel={t("fields.upload")}
            uploadingLabel={t("fields.uploading")}
            onUpload={imageUploadEnabled ? upload : undefined}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-sm leading-4.25 font-semibold text-foreground">
              {t("fields.translations")}
            </span>
            <span className="text-xs text-natural-500">{t("fields.translationsHint")}</span>
            <Tabs
              value={locale}
              onValueChange={(next) => {
                const picked = ROUTE_LOCALES.find((code) => code === next);
                if (picked) setLocale(picked);
              }}
            >
              <TabsList>
                {ROUTE_LOCALES.map((code) => (
                  <TabsTab key={code} value={code} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`size-2 shrink-0 rounded-full ${
                        draft.translations[code].title.trim() ? "bg-positive-500" : "bg-natural-200"
                      }`}
                    />
                    {t(`locales.${code}`)}
                  </TabsTab>
                ))}
              </TabsList>

              {ROUTE_LOCALES.map((code) => (
                <TabsPanel key={code} value={code} className="flex flex-col gap-4 pt-2">
                  <TextField
                    fieldClassName="h-12"
                    label={t("fields.title")}
                    value={draft.translations[code].title}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        translations: {
                          ...previous.translations,
                          [code]: { ...previous.translations[code], title: event.target.value },
                        },
                      }))
                    }
                  />
                  <TextField
                    multiline
                    label={t("fields.description")}
                    value={draft.translations[code].description}
                    onChange={(event) =>
                      setDraft((previous) => ({
                        ...previous,
                        translations: {
                          ...previous.translations,
                          [code]: {
                            ...previous.translations[code],
                            description: event.target.value,
                          },
                        },
                      }))
                    }
                  />
                </TabsPanel>
              ))}
            </Tabs>
          </div>
        </div>

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button variant="brand" disabled={!canSubmit || pending} onClick={() => void submit()}>
            {route ? t("save") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
