import { Button } from "@yacht-charter/ui/components/actions/button";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";

/*
 * EarnCta — Figma "Main Page" section (node 605:4206). A rounded hero banner with a full-bleed
 * photo of a couple at the rail, a left-anchored dark gradient for legibility, and an
 * "Earn With Your Yacht" headline + copy + white "List Your Yacht" link (node 615:8336 family).
 * Text column is 481px (gap 24), H2 Manrope Medium 50/1.1, body Regular 20/1.4, both white.
 * Link points at /yachts until an owner/listing route exists (TODO).
 */

export default function EarnCta() {
  const t = useTranslations("Home.EarnCta");

  return (
    <section className="bg-background">
      <div className="mx-auto max-w-[1536px] px-4 py-[60px] md:px-[54px] md:py-[70px] 2xl:px-[70px] 2xl:pt-[100px] 2xl:pb-[100px]">
        <div className="relative isolate overflow-hidden rounded-[20px]">
          <Image
            src="/assets/home/earn/couple-yacht.webp"
            alt=""
            fill
            sizes="(max-width: 1536px) 100vw, 1396px"
            className="-z-10 transform-gpu object-cover object-right"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/50 to-transparent" />

          <div className="relative z-10 flex min-h-[320px] items-center p-8 md:min-h-[291px] md:p-6 2xl:min-h-[391px] 2xl:p-16">
            <div className="flex flex-col items-start gap-4 md:gap-6">
              <h2 className="text-[32px] leading-[1.1] font-medium text-white 2xl:text-[50px] 2xl:whitespace-nowrap">
                {t("heading")}
              </h2>
              <p className="max-w-[481px] text-lg leading-[1.4] text-white md:text-xl">
                {t("description")}
              </p>
              <Button
                variant="neutral"
                size="md"
                nativeButton={false}
                render={<Link href="/yachts" />}
                className="w-fit"
              >
                {t("cta")}
                <ArrowUpRight />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
