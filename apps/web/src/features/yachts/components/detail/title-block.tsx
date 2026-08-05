"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import { Bookmark, Map, Sailboat, Share, Star, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import { MarinaPopover } from "@/components/shared/overlay/marina-popover";

import { useListingDetail } from "../../hooks/use-listing-detail";
import { toMarina } from "../../lib/to-marina";

const ACTION = "w-full md:flex-1 xl:w-auto xl:flex-none";

const prettify = (slug: string) => slug.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function TitleBlock() {
  const tDetail = useTranslations("YachtDetail");
  const { data } = useListingDetail();

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4 md:gap-6 xl:flex-row xl:flex-wrap xl:items-start xl:justify-between xl:gap-5">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-5 xl:flex-col-reverse xl:items-start xl:gap-4">
          <MarinaPopover marina={toMarina(data.base)} />

          <div className="flex flex-wrap items-start gap-1.5">
            {data.badges.map((badge) => (
              <Chip key={badge.code}>{badge.label}</Chip>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-4">
          <h1 className="text-[42px] font-bold leading-[1.15] text-foreground">{data.title}</h1>
          <Chip className="bg-transparent p-1.5 text-gold">
            <Star className="fill-current" />
            {data.rating}
          </Chip>
          <div className="flex basis-full items-center gap-1.5 md:basis-auto">
            <Chip variant="neutral">
              <Sailboat />
              {data.category}
            </Chip>
            {data.crewType ? (
              <Chip variant="neutral">
                <Users />
                {prettify(data.crewType)}
              </Chip>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 md:flex-row-reverse md:gap-3 xl:flex-row">
        <Button variant="subtle" className={`${ACTION} max-xl:border-border max-xl:bg-secondary`}>
          <Share />
          {tDetail("share")}
        </Button>
        <Button variant="neutral" className={ACTION}>
          <Map />
          {tDetail("seeOnMap")}
        </Button>
        <Button variant="brand" className={`${ACTION} max-md:order-first`}>
          <Bookmark />
          {tDetail("addToWishlist")}
        </Button>
      </div>
    </div>
  );
}
