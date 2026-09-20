"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { Checkbox } from "@yacht-charter/ui/components/form/checkbox";
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
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  useFacetMedia,
  useUpdateFacetMedia,
  useUploadFacetImage,
} from "../hooks/use-popular-facets";
import type { PopularFacetKind } from "../types";
import PhotoField from "./photo-field";

const LOCALES = SITE_LOCALES;
type Locale = (typeof LOCALES)[number];
type Pane = { label: string; description: string };

const emptyPanes = () => perSiteLocaleValue<Pane>(() => ({ label: "", description: "" }));

interface FacetMediaDialogProps {
  /** The value being edited, or null while the dialog is closed. */
  target: { kind: PopularFacetKind; value: string; label: string } | null;
  onOpenChange: (open: boolean) => void;
}

/*
 * The photo and copy a facet value's home page card shows: a country's destination tile, a boat
 * type's card. Per language, because the label and the description are both read in the visitor's
 * language, and a language left blank falls back to the catalogue's own name and English copy.
 */
export default function FacetMediaDialog({ target, onOpenChange }: FacetMediaDialogProps) {
  const t = useTranslations("Admin.Popular.media");

  const { data, isPending } = useFacetMedia(target);
  const update = useUpdateFacetMedia();
  const upload = useUploadFacetImage();

  const [locale, setLocale] = useState<Locale>("en");
  const [imageUrl, setImageUrl] = useState("");
  const [hoverImageUrl, setHoverImageUrl] = useState("");
  const [gridUsesHoverImage, setGridUsesHoverImage] = useState(true);
  const [uploadingField, setUploadingField] = useState<"image" | "hover" | null>(null);
  const [panes, setPanes] = useState<Record<Locale, Pane>>(emptyPanes);

  useEffect(() => {
    if (!data) return;
    const next = emptyPanes();
    for (const entry of data.translations) {
      next[entry.locale] = { label: entry.label ?? "", description: entry.description ?? "" };
    }
    setPanes(next);
    setImageUrl(data.imageUrl ?? "");
    setHoverImageUrl(data.hoverImageUrl ?? "");
    setGridUsesHoverImage(data.gridUsesHoverImage);
    setLocale("en");
  }, [data]);

  const setPane = (code: Locale, patch: Partial<Pane>) =>
    setPanes((previous) => ({ ...previous, [code]: { ...previous[code], ...patch } }));

  const pickFile = (field: "image" | "hover", file: File | undefined) => {
    if (!file || !target) return;
    setUploadingField(field);
    upload.mutate(
      { kind: target.kind, file },
      {
        onSuccess: (result) => (field === "image" ? setImageUrl : setHoverImageUrl)(result.url),
        onSettled: () => setUploadingField(null),
        onError: (error) => toast.error(error.message || t("uploadFailed")),
      },
    );
  };

  const save = () => {
    if (!target) return;
    update.mutate(
      {
        kind: target.kind,
        value: target.value,
        imageUrl: imageUrl.trim() || null,
        hoverImageUrl: hoverImageUrl.trim() || null,
        gridUsesHoverImage,
        translations: LOCALES.map((code) => ({
          locale: code,
          label: panes[code].label.trim() || null,
          description: panes[code].description.trim() || null,
        })),
      },
      {
        onSuccess: (result) => {
          const fresh = result.cache.ok || !result.cache.attempted;
          toast[fresh ? "success" : "warning"](fresh ? t("saved") : t("cacheWarning"));
          onOpenChange(false);
        },
        onError: () => toast.error(t("saveFailed")),
      },
    );
  };

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showClose
        className="max-h-[85dvh] w-[92vw] max-w-172 items-stretch overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t("title", { name: target?.label ?? "" })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {isPending || !data ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex w-full flex-col gap-4 text-left">
            <PhotoField
              label={t("imageUrl")}
              hint={data.uploadEnabled ? t("imageHint") : t("imageHintNoUpload")}
              alt={target?.label ?? ""}
              value={imageUrl}
              onChange={setImageUrl}
              uploading={uploadingField === "image"}
              uploadLabel={t("upload")}
              uploadingLabel={t("uploading")}
              onUpload={data.uploadEnabled ? (file) => pickFile("image", file) : undefined}
            />
            <PhotoField
              label={t("hoverImageUrl")}
              hint={t("hoverImageHint")}
              alt={target?.label ?? ""}
              value={hoverImageUrl}
              onChange={setHoverImageUrl}
              uploading={uploadingField === "hover"}
              uploadLabel={t("upload")}
              uploadingLabel={t("uploading")}
              onUpload={data.uploadEnabled ? (file) => pickFile("hover", file) : undefined}
            />
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                checked={gridUsesHoverImage}
                onCheckedChange={(checked) => setGridUsesHoverImage(checked === true)}
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">
                  {t("gridUsesHoverImage")}
                </span>
                <span className="text-xs text-natural-500">{t("gridUsesHoverImageHint")}</span>
              </span>
            </label>

            <Tabs
              value={locale}
              onValueChange={(next) => {
                const picked = LOCALES.find((code) => code === next);
                if (picked) setLocale(picked);
              }}
            >
              <TabsList>
                {LOCALES.map((code) => (
                  <TabsTab key={code} value={code} className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`size-2 shrink-0 rounded-full ${
                        panes[code].label.trim() || panes[code].description.trim()
                          ? "bg-positive-500"
                          : "bg-natural-200"
                      }`}
                    />
                    {t(`locales.${code}`)}
                  </TabsTab>
                ))}
              </TabsList>

              {LOCALES.map((code) => (
                <TabsPanel key={code} value={code} className="flex flex-col gap-4 pt-2">
                  <TextField
                    fieldClassName="h-12"
                    label={t("label")}
                    placeholder={data.name}
                    supportingText={t("labelHint", { name: data.name })}
                    value={panes[code].label}
                    onChange={(event) => setPane(code, { label: event.target.value })}
                  />
                  <TextField
                    multiline
                    label={t("descriptionField")}
                    supportingText={code === "en" ? t("descriptionHintEn") : t("descriptionHint")}
                    value={panes[code].description}
                    onChange={(event) => setPane(code, { description: event.target.value })}
                  />
                </TabsPanel>
              ))}
            </Tabs>
          </div>
        )}

        <DialogFooter>
          <Button variant="neutral" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="brand"
            disabled={!data || update.isPending || upload.isPending}
            onClick={save}
          >
            {update.isPending ? t("saving") : t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
