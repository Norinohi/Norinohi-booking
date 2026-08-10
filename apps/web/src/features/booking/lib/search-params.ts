import { createSerializer, parseAsString, parseAsStringLiteral } from "nuqs";

export const PAYMENT_METHODS = ["card", "invoice", "question"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** The quote the wizard is booking — minted on the detail page, revalidated on entry. */
export const bookingParsers = {
  quoteId: parseAsString,
};

export const serializeBooking = createSerializer(bookingParsers);

export const confirmationParsers = {
  method: parseAsStringLiteral(PAYMENT_METHODS),
  /** The held booking to load the confirmation from — survives the cross-route navigation. */
  bookingId: parseAsString,
};

export const serializeConfirmation = createSerializer(confirmationParsers);
