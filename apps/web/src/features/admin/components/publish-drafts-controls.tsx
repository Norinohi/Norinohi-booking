"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Select } from "@yacht-charter/ui/components/form/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@yacht-charter/ui/components/overlay/dialog";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { usePublishDrafts } from "../hooks/use-listings";
import type { ProviderKey } from "../types";

/*
 * PublishDraftsControls: releasing a provider's remaining drafts in one go, above the table.
 *
 * The procedure treats a missing provider as "publish every provider's drafts in the entire
 * catalogue", which in production is thousands of yachts nobody has looked at. That is not a
 * mistake this screen lets anyone make: the picker has no "all providers" entry, the button
 * stays disabled until a provider is named, and the named provider is repeated back in the
 * confirmation. Releasing the whole catalogue at once remains possible from the API, on purpose.
 */

const PROVIDERS: readonly ProviderKey[] = ["mock", "booking_manager", "nausys"];

/* Nothing chosen yet. Not "" because a falsy Select value renders the placeholder, which is what
   an unmade choice should look like, but it also has to be distinguishable from a real key. */
const UNSET = "";

export default function PublishDraftsControls() {
  const t = useTranslations("Admin.Listings.publishDrafts");
  const [provider, setProvider] = useState<string>(UNSET);
  const [confirming, setConfirming] = useState(false);
  const publishDrafts = usePublishDrafts();

  const target = PROVIDERS.find((key) => key === provider);

  const confirm = async () => {
    if (!target) return;

    try {
      const result = await publishDrafts.mutateAsync({ provider: target });
      toast.success(
        t("published", { count: result.publishedCount, provider: t(`provider.${target}`) }),
      );
      setConfirming(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("failed"));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="min-w-0 md:w-56">
          <Select
            className="h-12 min-w-0"
            ariaLabel={t("providerLabel")}
            value={provider}
            placeholder={t("choose")}
            onValueChange={setProvider}
            options={PROVIDERS.map((key) => ({ value: key, label: t(`provider.${key}`) }))}
          />
        </div>

        <Button
          variant="brand"
          className="md:w-auto"
          disabled={!target || publishDrafts.isPending}
          onClick={() => setConfirming(true)}
        >
          <Upload />
          {t("action")}
        </Button>
      </div>

      <p className="text-sm leading-[1.3] font-medium text-natural-500">{t("hint")}</p>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent showClose className="items-stretch">
          <DialogHeader>
            <DialogTitle>{t("confirmTitle")}</DialogTitle>
            <DialogDescription>
              {target ? t("confirmBody", { provider: t(`provider.${target}`) }) : ""}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="neutral" onClick={() => setConfirming(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="brand"
              disabled={!target || publishDrafts.isPending}
              onClick={() => void confirm()}
            >
              {publishDrafts.isPending ? t("publishing") : t("confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
