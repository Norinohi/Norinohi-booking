"use client";

import { Button } from "@yacht-charter/ui/components/actions/button";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export type LegalDocument = "terms" | "privacy" | "cancellation";

export interface LegalDocumentPendingProps {
  document: LegalDocument;
}

/**
 * The page a legal document will live on, until the document exists.
 *
 * The booking consents and the footer link here, so the address has to answer now rather than
 * lead to "#". It says the text is being prepared and nothing else: no wording is invented for a
 * document the client has not supplied.
 */
export default function LegalDocumentPending({ document }: LegalDocumentPendingProps) {
  const t = useTranslations("Layout.Legal");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col items-start gap-6 px-4 py-12 md:px-13.5 md:py-20">
      <h1 className="text-h4 text-foreground">{t(document)}</h1>
      <p className="text-base leading-[1.5] text-natural-600">{t("pending")}</p>
      <Button variant="brand" nativeButton={false} render={<Link href="/contact" />}>
        {t("contact")}
      </Button>
    </main>
  );
}
