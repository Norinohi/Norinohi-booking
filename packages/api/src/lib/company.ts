/*
 * The seller side of every invoice we issue — the half that is the same on all of them.
 *
 * Deliberately a committed constant rather than env: these are legal identifiers that must match
 * what is filed with the tax authority, and an invoice that renders a different VAT number per
 * deployment is a compliance problem, not a configuration feature. Change them here, in a commit,
 * with the change visible in review.
 *
 * TODO: placeholders until the operating entity is registered — replace before issuing a real
 * invoice. Bank details are the marketplace's own account; charter money is collected by us and
 * settled with the operator separately.
 */
export const COMPANY = {
  legalName: "Norinohi Ltd.",
  tradingName: "YachtSkanner",
  addressLine1: "Ulica grada Vukovara 269",
  addressLine2: null,
  city: "Zagreb",
  postalCode: "10000",
  countryCode: "HR",
  vatNumber: "HR00000000000",
  registrationNumber: "000000000",
  email: "billing@yachtskanner.com",
  phone: "+385 1 000 0000",
  website: "https://yachtskanner.com",
  bank: {
    name: "Zagrebačka banka d.d.",
    iban: "HR0000000000000000000",
    bic: "ZABAHR2X",
  },
} as const;

/** Days from issue to due date, before the check-in cap applies. */
export const INVOICE_PAYMENT_TERMS_DAYS = 7;
