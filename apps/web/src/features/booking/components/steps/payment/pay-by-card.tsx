"use client";

import { Notification } from "@yacht-charter/ui/components/feedback/notification";
import { TextField } from "@yacht-charter/ui/components/form/text-field";
import { CreditCard, Shield, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";

export default function PayByCard() {
  const t = useTranslations("Booking.payment.card");

  return (
    <div className="flex flex-col gap-4">
      <Notification variant="warning" icon={<TriangleAlert />}>
        {t("unavailable")}
      </Notification>

      <TextField
        label={t("number")}
        placeholder={t("numberPlaceholder")}
        startIcon={<CreditCard />}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <TextField label={t("expiry")} placeholder={t("expiryPlaceholder")} />
        <TextField label={t("cvc")} placeholder={t("cvcPlaceholder")} />
      </div>

      <TextField label={t("name")} placeholder={t("namePlaceholder")} />

      <Notification icon={<Shield />}>{t("notice")}</Notification>
    </div>
  );
}
