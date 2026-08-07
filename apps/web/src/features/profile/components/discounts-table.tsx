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
import { PaginationControl } from "@yacht-charter/ui/components/navigation/pagination";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { DISCOUNTS_PAGE_COUNT, SAMPLE_DISCOUNTS, type Discount } from "../lib/discounts";

/*
 * DiscountsTable — the "Discounts" tab table + pagination of /profile/discounts.
 * Figma "Discount & Price Manager": desktop 972:55055 / tablet 973:90636 / mobile 973:99174.
 * Six equal columns (`table-fixed`, min 960px so tablet/mobile scroll horizontally like the
 * frames); header on natural-50, 50px rows, Active as a brand Chip, long names ellipsize.
 * Contract: rows come from SAMPLE_DISCOUNTS; clicking a row calls `onEdit(discount)`.
 */
export default function DiscountsTable({ onEdit }: { onEdit: (discount: Discount) => void }) {
  const t = useTranslations("Discounts");
  const [page, setPage] = useState(1);

  // Design copy: "10% Percentage"; fixed amounts follow the €-prefix convention (referrals).
  const typeValue = (discount: Discount) =>
    discount.type === "percentage"
      ? `${discount.value}% ${t("type.percentage")}`
      : `€${discount.value} ${t("type.fixed")}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Header + body rows pinned to the design's exact 50px (the primitives' py-3.5 plus
          the 28px chip / 24px line-height would otherwise stretch them to 53/57). */}
      <Table className="min-w-[960px] table-fixed [&_td]:h-[50px] [&_td]:py-0 [&_th]:h-[50px] [&_th]:py-0">
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
          {SAMPLE_DISCOUNTS.map((discount) => (
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
              <TableCell className="whitespace-nowrap">
                {t(`applies.${discount.appliesTo}`)}
              </TableCell>
              <TableCell>
                <Chip variant={discount.status === "active" ? "brand" : "neutral"}>
                  {t(`status.${discount.status}`)}
                </Chip>
              </TableCell>
              <TableCell className="whitespace-nowrap">{discount.usage}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="flex justify-center md:justify-start">
        <PaginationControl
          page={page}
          onPageChange={setPage}
          pageCount={DISCOUNTS_PAGE_COUNT}
          summary={false}
        />
      </div>
    </div>
  );
}
