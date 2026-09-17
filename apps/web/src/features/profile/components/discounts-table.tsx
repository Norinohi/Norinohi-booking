"use client";

import { Chip } from "@yacht-charter/ui/components/data-display/chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@yacht-charter/ui/components/data-display/table";
import { Skeleton } from "@yacht-charter/ui/components/feedback/skeleton";
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

import { useMoney } from "@/hooks/use-money";

import { useDiscounts } from "../hooks/use-discounts";
import { CATEGORY_TARGET_OPTIONS } from "../lib/discounts";
import type { Discount } from "../types";

/*
 * DiscountsTable — the "Discounts" tab table + pagination of /profile/discounts.
 * Figma "Discount & Price Manager": desktop 972:55055 / tablet 973:90636 / mobile 973:99174.
 * Six equal columns (`table-fixed`, min 960px so tablet/mobile scroll horizontally like the
 * frames); header on natural-50, 50px rows, Active as a brand Chip, long names ellipsize.
 * Contract: rows come from `admin.discount.list` via `useDiscounts({ page })`; clicking a
 * row calls `onEdit(discount)`. Loading keeps the table silhouette with skeleton rows;
 * error/empty render a single full-span message row.
 */

const SKELETON_ROWS = 5;

/** Per-column skeleton widths mirroring typical cell content. */
const SKELETON_WIDTHS = ["w-3/4", "w-24", "w-20", "w-28", "w-16", "w-12"];

interface DiscountsTableProps {
  onEdit: (discount: Discount) => void;
}

export default function DiscountsTable({ onEdit }: DiscountsTableProps) {
  const t = useTranslations("Discounts");
  const formatMoney = useMoney();
  const format = useFormatter();
  const [page, setPage] = useState(1);

  const { data, isPending, isError } = useDiscounts({ page });

  // Percentage discounts show "10%"; fixed amounts the EUR-formatted value (referrals convention).
  // `valuePct` is a whole-or-fractional percent (0–100); the locale decides the sign placement.
  const typeValue = (discount: Discount) =>
    discount.type === "percentage"
      ? discount.valuePct !== null
        ? format.number(discount.valuePct / 100, { style: "percent", maximumFractionDigits: 2 })
        : "—"
      : discount.value !== null
        ? formatMoney(discount.value.amountMinor, discount.value.currency)
        : "—";

  /* Beyond two names the narrow cell reads better as a count. */
  const appliesTo = (discount: Discount) => {
    if (discount.targets.some((target) => target.targetType === "all")) {
      return t("applies.allYachts");
    }
    if (discount.targets.length === 0) return t("applies.nothing");

    const named = discount.targets.map((target) => {
      const listed = CATEGORY_TARGET_OPTIONS.find(
        (option) => target.targetType === "category" && option.id === target.targetId,
      );
      if (listed) return t(`applies.${listed.key}`);
      /* A target whose row has since been deleted keeps its id, which is what tracks it down. */
      return (
        target.targetLabel ??
        t("applies.missing", { type: target.targetType, id: target.targetId ?? "-" })
      );
    });

    return named.length <= 2
      ? named.join(", ")
      : t("applies.more", { first: named[0], count: named.length - 1 });
  };

  const messageRow = (message: string) => (
    <TableRow>
      <TableCell colSpan={6} className="text-center text-sm font-medium text-natural-500">
        {message}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header + body rows pinned to the design's exact 50px (the primitives' py-3.5 plus
          the 28px chip / 24px line-height would otherwise stretch them to 53/57). */}
      <Table className="min-w-240 table-fixed [&_td]:h-12.5 [&_td]:py-0 [&_th]:h-12.5 [&_th]:py-0">
        <TableHeader>
          <TableRow>
            <TableHead>{t("table.name")}</TableHead>
            <TableHead>{t("table.code")}</TableHead>
            <TableHead>{t("table.typeValue")}</TableHead>
            <TableHead>{t("table.appliesTo")}</TableHead>
            <TableHead>{t("table.status")}</TableHead>
            <TableHead>{t("table.usage")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isPending
            ? Array.from({ length: SKELETON_ROWS }, (_, row) => (
                <TableRow key={row}>
                  {SKELETON_WIDTHS.map((width) => (
                    <TableCell key={width}>
                      <Skeleton className={`h-4 rounded-md ${width}`} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : isError
              ? messageRow(t("table.error"))
              : data.items.length === 0
                ? messageRow(t("table.empty"))
                : data.items.map((discount) => (
                    <TableRow
                      key={discount.id}
                      tabIndex={0}
                      onClick={() => onEdit(discount)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onEdit(discount);
                        }
                      }}
                      className="cursor-pointer outline-none transition-colors hover:bg-natural-50 focus-visible:bg-natural-50"
                    >
                      <TableCell className="truncate">{discount.name}</TableCell>
                      <TableCell className="whitespace-nowrap">{discount.code}</TableCell>
                      <TableCell className="whitespace-nowrap">{typeValue(discount)}</TableCell>
                      <TableCell className="truncate">{appliesTo(discount)}</TableCell>
                      <TableCell>
                        <Chip variant={discount.status === "active" ? "brand" : "neutral"}>
                          {t(`status.${discount.status}`)}
                        </Chip>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {`${discount.usageCount}/${discount.usageLimit ?? "∞"}`}
                      </TableCell>
                    </TableRow>
                  ))}
        </TableBody>
      </Table>

      {data && data.pagination.totalPages > 0 ? (
        <div className="flex justify-center md:justify-start">
          <PaginationControl
            page={page}
            onPageChange={setPage}
            pageCount={data.pagination.totalPages}
            summary={false}
          />
        </div>
      ) : null}
    </div>
  );
}
