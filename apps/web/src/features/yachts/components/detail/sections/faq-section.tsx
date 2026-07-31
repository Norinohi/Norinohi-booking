import { useTranslations } from "next-intl";

import DetailSection from "./detail-section";

const FAQ = [
  {
    question: "Are pets allowed on board?",
    answer:
      'If you choose the "Without Captain" option, you must have a valid ICC or equivalent skipper license recognized by the local authorities. If you hire a skipper, no license is required from your side.',
  },
  {
    question: "Is there a security deposit required?",
    answer:
      "Yes, we have a network of professional, local skippers. You can add this service during the booking process or even after confirmation.",
  },
  {
    question: "What is the cancellation policy?",
    answer:
      "Fuel is not included in the rental price. You will receive the boat with a full tank and are expected to return it full. Alternatively, we can calculate the consumption at the end of the trip.",
  },
  {
    question: "Are there any hidden fees?",
    answer:
      "A security deposit is required to cover any potential damages. This can be paid via credit card authorization at the base or through a non-refundable deposit insurance.",
  },
] as const;

export default function FaqSection() {
  const t = useTranslations("YachtDetail");

  return (
    <DetailSection id="faq" title={t("sections.faq")}>
      <dl className="flex flex-col gap-3">
        {FAQ.map((item) => (
          <div
            key={item.question}
            className="flex flex-col gap-2 border-b border-dashed border-border pb-2.75"
          >
            <dt className="text-base leading-5.5 font-bold text-foreground">{item.question}</dt>
            <dd className="text-base leading-5.5 text-natural-600">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </DetailSection>
  );
}
