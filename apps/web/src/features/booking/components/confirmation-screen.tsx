"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { cn } from "@yacht-charter/ui/lib/utils";
import { FileText, Share2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";

import { Image } from "@/components/shared/data-display/image";
import { GROUP, POP, RISE } from "@/lib/motion";

/* TODO: hardcoded charter mock until the booking record loads from the backend (M5). */
const AMOUNT = "€5,000";

const CONFETTI_COLORS = ["#2f80ed", "#eab308", "#ec4899", "#22c55e", "#a855f7", "#f97316"];

function noise(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

const CONFETTI = Array.from({ length: 48 }, (_, i) => ({
  left: noise(i + 1) * 100,
  size: 6 + noise(i + 2) * 6,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  delay: 0.2 + noise(i + 3) * 0.35,
  duration: 2.2 + noise(i + 4) * 1.4,
  drift: (noise(i + 5) - 0.5) * 140,
  spin: noise(i + 6) * 720 - 360,
  round: noise(i + 7) > 0.5,
}));

function Confetti() {
  const reduced = useReducedMotion();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {CONFETTI.map((piece, i) => (
        <motion.span
          key={i}
          className={cn("absolute top-0 block", piece.round && "rounded-full")}
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.round ? piece.size : piece.size * 1.6,
            backgroundColor: piece.color,
          }}
          initial={{ y: -40, x: 0, rotate: 0, opacity: 0 }}
          animate={
            reduced
              ? { opacity: 0 }
              : { y: 1200, x: piece.drift, rotate: piece.spin, opacity: [0, 1, 1, 0] }
          }
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: piece.duration,
                  delay: piece.delay,
                  ease: "easeIn",
                  opacity: {
                    duration: piece.duration,
                    delay: piece.delay,
                    times: [0, 0.08, 0.7, 1],
                  },
                }
          }
        />
      ))}
    </div>
  );
}

type SummaryRow = {
  label: string;
  value: string;
  note?: string;
  emphasis?: "bold" | "strong";
};

function Row({ row, last }: { row: SummaryRow; last: boolean }) {
  return (
    <div
      className={cn(
        "flex w-full items-center gap-4 py-3 md:gap-10 md:py-2.75",
        last || "border-b border-dashed border-border",
      )}
    >
      <dt className="min-w-0 flex-1 text-base leading-[1.4] font-bold text-foreground">
        {row.label}
      </dt>
      <dd
        className={cn(
          "flex min-w-0 flex-1 gap-2",
          row.emphasis === "strong"
            ? "flex-col items-start md:flex-row md:items-center"
            : "items-center",
        )}
      >
        {row.emphasis === "strong" ? (
          <>
            <span className="text-xl leading-[1.3] font-bold text-foreground">{row.value}</span>
            {row.note ? (
              <span className="text-sm leading-[1.3] font-medium text-natural-500">{row.note}</span>
            ) : null}
          </>
        ) : (
          <span
            className={cn(
              "text-base leading-[1.4]",
              row.emphasis === "bold" ? "font-bold text-foreground" : "text-natural-600",
            )}
          >
            {row.value}
          </span>
        )}
      </dd>
    </div>
  );
}

export default function BookingConfirmationScreen() {
  const t = useTranslations("Booking.confirmation");

  const rows: SummaryRow[] = [
    { label: t("summary.yacht"), value: 'Lagoon 42 "Jupiter One"' },
    { label: t("summary.dates"), value: "7 – 14 July, 2026" },
    { label: t("summary.crew"), value: "Full" },
    { label: t("summary.mandatory"), value: "6 people" },
    {
      label: t("summary.selectedExtras"),
      value:
        "Inflatable tender garage, Inflatable tender garage, Hot tub, Gas BBQ, Advanced navigation system, Inflatable tender garage, Premium Protection ",
    },
    { label: t("summary.boatPrice"), value: "€10,000", emphasis: "bold" },
    { label: t("summary.deposit"), value: "€2,000", emphasis: "bold" },
    {
      label: t("summary.secondPayment", { date: "31.06.2026" }),
      value: "€5,000",
      emphasis: "bold",
    },
    {
      label: t("summary.totalPrice"),
      value: "€12,500",
      note: t("summary.perPerson", { price: "€3,500" }),
      emphasis: "strong",
    },
    { label: t("summary.dueNow"), value: AMOUNT, emphasis: "strong" },
  ];

  return (
    <section className="flex min-h-full justify-center px-4 pt-6 pb-8 md:px-6 md:py-23">
      <article className="relative isolate w-full max-w-201.5 overflow-hidden rounded-2xl border border-border bg-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-0 aspect-[806/504]"
        >
          <Image
            src="/assets/illustrations/booking-confetti.svg"
            alt=""
            fill
            unoptimized
            className="object-cover object-top"
          />
        </div>

        <Confetti />

        <motion.div
          variants={GROUP}
          initial="hidden"
          animate="show"
          className="relative z-10 flex flex-col"
        >
          <motion.div
            variants={RISE}
            className="flex flex-col items-center gap-5 px-3 py-5 md:p-5 md:py-8"
          >
            <motion.div variants={POP}>
              <Image
                src="/assets/illustrations/booking-reserved.png"
                alt=""
                width={80}
                height={80}
                className="size-20"
              />
            </motion.div>
            <div className="flex flex-col items-center gap-4 pt-3 text-center">
              <h1 className="text-[28px] leading-[1.1] font-medium text-foreground md:text-[32px]">
                {t("reserved")}
              </h1>
              <p className="text-base leading-[1.4] text-foreground opacity-80">
                {t("remaining", { amount: AMOUNT })}
              </p>
              <p className="text-sm leading-[1.3] font-medium text-natural-600">{t("emailed")}</p>
            </div>
            <Button variant="neutral" className="w-full md:w-auto">
              {t("viewBooking")}
            </Button>
          </motion.div>

          <motion.div variants={RISE} className="flex flex-col p-5">
            <h2 className="py-2 text-xl leading-[1.3] font-bold text-foreground">
              {t("summaryTitle")}
            </h2>
            <dl className="flex flex-col">
              {rows.map((row, index) => (
                <Row key={row.label} row={row} last={index === rows.length - 1} />
              ))}
            </dl>
          </motion.div>

          <motion.div variants={RISE} className="flex flex-col">
            <span aria-hidden className="block h-px w-full bg-border" />
            <p className="p-5 text-center text-sm leading-[1.3] tracking-[0.56px] text-natural-500 uppercase">
              {t("quote")}
            </p>
          </motion.div>

          <motion.div variants={RISE} className="flex flex-col">
            <span aria-hidden className="block h-px w-full bg-border" />
            <div className="flex flex-col-reverse gap-4 p-5 md:flex-row">
              <Button variant="neutral" className="w-full md:flex-1">
                <Share2 />
                {t("shareTrip")}
              </Button>
              <Button variant="brand" className="w-full md:flex-1">
                <FileText />
                {t("downloadReceipt")}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      </article>
    </section>
  );
}
