import { Button } from "@yacht-charter/ui/components/actions/button";
import { ArrowUpRight } from "lucide-react";
import * as motion from "motion/react-client";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { Link } from "@/i18n/navigation";

import { RISE, VIEWPORT } from "@/lib/motion";

export default function EarnCta() {
  const t = useTranslations("Home.EarnCta");

  return (
    <section className="bg-background">
      <div className="mx-auto max-w-384 px-4 py-10 md:px-13.5 md:py-17.5 xl:px-17.5 xl:py-25">
        <motion.div
          variants={RISE}
          initial="hidden"
          whileInView="show"
          viewport={VIEWPORT}
          className="relative isolate overflow-hidden rounded-3xl"
        >
          <Image
            src="/assets/home/earn/couple-yacht.webp"
            alt=""
            fill
            sizes="(max-width: 1536px) 100vw, 1396px"
            className="-z-10 transform-gpu object-cover object-right"
          />
          <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/50 to-transparent" />

          <div className="relative z-10 flex min-h-77.25 items-center p-6 md:min-h-72.75 xl:min-h-97.75 xl:p-16">
            <div className="flex flex-col items-center gap-4 text-center md:items-start md:gap-6 md:text-left">
              <h2 className="text-[28px] leading-[1.1] font-medium text-white md:text-[32px] xl:text-[50px] xl:whitespace-nowrap">
                {t("heading")}
              </h2>
              <p className="max-w-120.25 text-lg leading-[1.4] text-white md:text-xl">
                {t("description")}
              </p>
              <Button
                variant="neutral"
                size="md"
                nativeButton={false}
                render={<Link href="/yachts" />}
                className="w-full md:w-fit"
              >
                {t("cta")}
                <ArrowUpRight />
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
