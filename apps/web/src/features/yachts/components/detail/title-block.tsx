import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Bookmark, Map, Sailboat, Share, Star, Tag, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { SAMPLE_MARINAS } from "../../lib/sample-marinas";
import { MarinaPopover } from "../marina-popover";

export const YACHT_NAME = "Lagoon 42";

export default function TitleBlock() {
  const t = useTranslations("Common.boatCard");
  const tDetail = useTranslations("YachtDetail");

  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-start gap-1.5">
          <Chip>{t("badges.bestForFamilies")}</Chip>
          <Chip>{t("badges.bestValue")}</Chip>
          <Chip className="bg-brand text-brand-foreground">
            <Tag />
            {t("badges.discount", { percent: 15 })}
          </Chip>
        </div>

        <MarinaPopover marina={SAMPLE_MARINAS.aciSplit} />

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[42px] font-bold leading-[1.15] text-foreground">{YACHT_NAME}</h1>
          <Chip className="bg-transparent p-1.5 text-gold">
            <Star className="fill-current" />
            5.9
          </Chip>
          <div className="flex items-center gap-1.5">
            <Chip variant="neutral">
              <Sailboat />
              {t("charterTypes.bareboat")}
            </Chip>
            <Chip variant="neutral">
              <Users />
              {t("crews.fullCrew")}
            </Chip>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="subtle" className="capitalize">
          <Share />
          {tDetail("share")}
        </Button>
        <Button variant="neutral" className="capitalize">
          <Map />
          {tDetail("seeOnMap")}
        </Button>
        <Button variant="brand" className="capitalize">
          <Bookmark />
          {tDetail("addToWishlist")}
        </Button>
      </div>
    </div>
  );
}
