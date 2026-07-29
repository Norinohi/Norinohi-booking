"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@yacht-charter/ui/components/form/select";
import { cn } from "@yacht-charter/ui/lib/utils";
import { CalendarDays, MapPin, Sailboat, Search, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

/*
 * Hero — Figma "Main Page" hero (node 530:3101). Full-bleed sunset photo with a left headline
 * block, a right search card (Where to? / dates / boat / captain + Search), and a translucent
 * blurred stats bar overlapping the bottom. Desktop lays text + card side by side (2xl frame);
 * below that everything stacks. The card fields are the design-system Select/field primitives so
 * the look matches 1-в-1; Search routes to /yachts (real query wiring lands with the search work).
 */

const DESTINATIONS = ["Croatia", "Greece", "Italy", "Turkey", "Caribbean", "Thailand"];
const BOAT_TYPES = ["Catamaran", "Sailing yacht", "Motor yacht", "Gulet", "Luxury yacht"];
const CAPTAIN_OPTIONS = ["With captain", "Bareboat", "Skippered"];

const STATS: { value: string; label: string }[] = [
  { value: "30,000+", label: "yachts" },
  { value: "1,200+", label: "destinations" },
  { value: "20,000+", label: "happy travelers" },
  { value: "4.8", label: "average rating" },
];

function HeroSelect({
  icon,
  placeholder,
  options,
}: {
  icon: React.ReactNode;
  placeholder: string;
  options: string[];
}) {
  return (
    <Select>
      <SelectTrigger className="h-12 min-w-0">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {icon}
          <SelectValue placeholder={placeholder} />
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SearchCard() {
  return (
    <div className="mx-auto w-full max-w-[489px] shrink-0 rounded-2xl bg-card p-4 shadow-[0_10px_40px_rgba(0,0,0,0.18)] 2xl:mx-0 2xl:w-[438px]">
      <div className="flex flex-col gap-4">
        <HeroSelect
          icon={<MapPin className="size-6 shrink-0 text-foreground" />}
          placeholder="Where to?"
          options={DESTINATIONS}
        />

        {/* Dates — display field; the real date picker lands with search wiring. */}
        <button
          type="button"
          className="group flex h-12 w-full min-w-0 items-center gap-2 rounded-lg border border-input bg-transparent p-3 text-left text-base transition-colors outline-none hover:border-natural-200 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <CalendarDays className="size-6 shrink-0 text-foreground" />
          <span className="truncate text-natural-300">Any Dates</span>
        </button>

        <HeroSelect
          icon={<Sailboat className="size-6 shrink-0 text-foreground" />}
          placeholder="Any boat"
          options={BOAT_TYPES}
        />
        <HeroSelect
          icon={<Users className="size-6 shrink-0 text-foreground" />}
          placeholder="With Captain"
          options={CAPTAIN_OPTIONS}
        />

        <Button
          variant="brand"
          size="md"
          className="w-full"
          nativeButton={false}
          render={<Link href="/yachts" />}
        >
          <Search className="size-5" />
          Search
        </Button>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
        <span className="text-natural-600">Don't know how to choose?</span>
        <Link
          href="/yachts"
          className="font-medium text-brand underline underline-offset-2 transition-opacity hover:opacity-80"
        >
          Help Me Plan My Trip
        </Link>
      </div>
    </div>
  );
}

function StatsBar() {
  return (
    <div className="mx-auto w-full max-w-[1160px] rounded-2xl bg-black/15 backdrop-blur-md">
      <div className="grid grid-cols-2 md:grid-cols-4">
        {STATS.map((stat, index) => (
          <div
            key={stat.label}
            className={cn(
              "flex flex-col items-center gap-2 px-2 py-6 2xl:px-6 text-center text-white",
              index > 0 && "md:border-l md:border-white/20",
            )}
          >
            <span className="text-2xl leading-[1.1] font-medium md:text-[32px]">{stat.value}</span>
            <span className="text-base leading-[1.1] text-white/90 md:text-xl">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <Image
        src="/assets/hero/hero-yacht.webp"
        alt=""
        fill
        priority
        sizes="100vw"
        className="-z-10 transform-gpu object-cover"
      />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/45 via-black/15 to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-[560px] max-w-[1536px] flex-col gap-8 px-4 pt-12 pb-[60px] md:px-[54px] md:pt-[70px] md:pb-[65px] 2xl:min-h-[760px] 2xl:gap-10 2xl:px-[70px] 2xl:pt-[100px] 2xl:pb-[60px]">
        <div className="flex flex-1 flex-col items-center gap-8 2xl:flex-row 2xl:items-start 2xl:justify-between 2xl:gap-10">
          <div className="flex w-full max-w-[659px] flex-col gap-3 text-center text-white 2xl:w-auto 2xl:max-w-[450px] 2xl:text-left">
            <p className="text-base leading-[1.4] md:text-xl">
              Over 30,000 yachts in 1,200 destinations. Charters from €120/day
            </p>
            <h1 className="text-4xl leading-[1.1] font-bold md:text-[64px] 2xl:text-[64px]">
              Explore the world by yacht
            </h1>
          </div>

          <SearchCard />
        </div>

        <StatsBar />
      </div>
    </section>
  );
}
