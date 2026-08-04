import { createSerializer, parseAsStringLiteral } from "nuqs";

export const PAYMENT_METHODS = ["card", "invoice", "question"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const confirmationParsers = {
  method: parseAsStringLiteral(PAYMENT_METHODS),
};

export const serializeConfirmation = createSerializer(confirmationParsers);
