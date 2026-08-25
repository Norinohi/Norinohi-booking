import { z } from "zod";

import { includedItemSchema } from "./catalog";
import {
  dateRangeRefinement,
  idSchema,
  moneySchema,
  paginatedSchema,
  paginationInputDefault,
  paginationInputSchema,
} from "./primitives";

export const paymentScheduleKindSchema = z.enum([
  "deposit",
  "balance",
  "full",
  "checkin_extras",
  "security_deposit",
]);

/** Mirrors the quote line's `group`: which booking-summary section shows a line. */
export const lineGroupSchema = z.enum(["mandatory", "optional", "crew"]);

export const paymentStatusSchema = z.enum([
  "requires_payment",
  "processing",
  "succeeded",
  "failed",
  "refunded",
]);

export const bookingStatusSchema = z.enum([
  "DRAFT",
  "QUOTED",
  "OPTION_PENDING",
  "OPTION_HELD",
  "PAYMENT_PENDING",
  "CONFIRMING",
  "CONFIRMED",
  "QUOTE_EXPIRED",
  "OPTION_EXPIRED",
  "PAYMENT_FAILED",
  "PROVIDER_REJECTED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
]);

/**
 * One My Bookings card (Figma 972:54737). Everything here comes from the booking's
 * frozen commercial snapshot, so a card keeps rendering after the listing changes
 * or the provider withdraws it.
 */
export const bookingSummarySchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: bookingStatusSchema,
  listing: z.object({
    id: z.string(),
    title: z.string(),
    mainImage: z.string().nullable(),
    gallery: z.array(z.string()),
    rating: z.number(),
    reviewCount: z.number().int(),
    category: z.string().nullable(),
    crewType: z.string().nullable(),
    specs: z.object({
      lengthM: z.number(),
      cabins: z.number().int(),
      berths: z.number().int(),
      heads: z.number().int(),
      showers: z.number().int().nullable(),
      yearBuilt: z.number().int(),
      sailType: z.string().nullable(),
    }),
    /** The full list — the card takes the first three itself. */
    amenities: z.array(z.string()),
    badges: z.array(includedItemSchema),
  }),
  base: z.object({
    name: z.string(),
    locationName: z.string(),
    countryName: z.string(),
    /** Synthesised from name/location/country — the base has no dedicated address field. */
    address: z.string(),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
    /**
     * Every charter date on a booking is already stored and rendered as UTC
     * (see `combine` in services/booking.ts), so this is UTC until bases carry
     * a real IANA zone.
     */
    timeZone: z.string(),
    phone: z.string().nullable(),
    website: z.string().nullable(),
    email: z.string().nullable(),
  }),
  /** ISO datetimes — the card shows "7 July, 2026 17:00 → 25 July, 2026 22:00". */
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().int(),
  total: moneySchema,
  /** total / guests, rounded to the nearest minor unit. */
  perPerson: moneySchema,
  paidTotal: moneySchema,
  balanceDue: moneySchema,
  /**
   * What is still collectable over the life of the booking. Distinct from `balanceDue`
   * above, which subtracts payments from the whole total and so includes the
   * pay-at-check-in lines the base collects in person — a figure no screen should ever
   * offer to take.
   */
  outstanding: moneySchema,
  /**
   * What `checkout.payBalance` would charge if it were called now, and the only figure a
   * Pay affordance may show. Zero means there is nothing to take, either because the
   * booking is settled or because it cannot be paid in the state it is in — so a card can
   * decide whether to offer payment at all without loading the booking.
   *
   * Below `outstanding` on a deposit-policy booking that has not been confirmed yet: the
   * prepayment is what buys the charter, and the rest is collected later.
   */
  payableNow: moneySchema,
  /**
   * The part of the total the base collects in person. Never charged here and never chased,
   * but it has to be shown, or `total` minus `paidTotal` leaves a gap the screen cannot
   * explain: a fully settled booking still reads as underpaid by exactly this much.
   */
  dueAtCheckIn: moneySchema,
  /** What the quote's payment policy asked up front — the quote's `depositMinor`. */
  prepayment: moneySchema,
  nextPaymentDueAt: z.string().nullable(),
  cancellable: z.boolean(),
  createdAt: z.string(),
});

const DEFAULT_PAGE_SIZE = 10;

export const bookingListInputSchema = z
  .object({
    /** The "Any dates" filter; matched against the charter period, not booked-on. */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    status: z.array(bookingStatusSchema).optional(),
    ...paginationInputSchema({ maxPageSize: 50, defaultPageSize: DEFAULT_PAGE_SIZE }),
  })
  .default(paginationInputDefault(DEFAULT_PAGE_SIZE))
  .superRefine(dateRangeRefinement("from", "to", "to must be on or after from"));

export const bookingListSchema = paginatedSchema(bookingSummarySchema);

/**
 * The bearer token a guest checkout hands back, carried by every booking-scoped
 * call a customer can make before they have an account. Absent for a signed-in
 * caller, whose session says the same thing.
 */
export const guestAccessTokenSchema = z.string().trim().min(1).max(200);

export const bookingIdInputSchema = z.object({
  id: idSchema,
  accessToken: guestAccessTokenSchema.optional(),
});

/*
 * The three repeated blocks of a booking's money, named so the customer detail view and the
 * staff one cannot drift apart: they describe the same rows, and a field added for one is a
 * field the other should already have.
 */
export const bookingPriceLineSchema = z.object({
  code: z.string(),
  label: z.string(),
  amount: moneySchema,
  /** The summary section this line belongs to; null for the base and discounts. */
  group: lineGroupSchema.nullable(),
  /**
   * Whether we collect this line or the base does, on the day. A screen that totals these
   * without saying which is which shows a total nobody is ever asked to pay in one go.
   */
  payWhen: z.enum(["now", "at_check_in"]),
});

export const bookingScheduleEntrySchema = z.object({
  id: z.string(),
  kind: paymentScheduleKindSchema,
  amount: moneySchema,
  dueAt: z.string().nullable(),
  status: z.enum(["pending", "paid", "cancelled", "refunded"]),
});

export const bookingPaymentSchema = z.object({
  id: z.string(),
  kind: paymentScheduleKindSchema,
  amount: moneySchema,
  status: paymentStatusSchema,
  paidAt: z.string().nullable(),
  /**
   * How this installment arrived. Derived from whether Stripe holds an intent for
   * it, never stored: that is the fact itself, so a second column recording it
   * could only ever disagree. Per payment rather than per booking, because a
   * deposit paid by transfer and a balance paid by card is one booking with two
   * answers — which is also how `planRefund` already decides what it can send back.
   */
  method: z.enum(["card", "transfer"]),
  /**
   * Set once a chargeback opens. Kept off `status` because contested is not the
   * same as refunded: `disputeStatus` carries how it ended, and a won dispute
   * leaves the payment succeeded with both fields still telling the story.
   */
  disputedAt: z.string().nullable(),
  disputeStatus: z.string().nullable(),
});

/**
 * Detail for "View Details". Travellers are deliberately absent: §10 forbids
 * returning crew and passport data from this endpoint.
 */
/** The customer's view of a bank-transfer request; see `invoice` on `bookingDetailSchema`. */
export const bookingInvoiceSchema = z.object({
  number: z.string(),
  issuedAt: z.string(),
  dueAt: z.string(),
  amount: moneySchema,
  status: z.enum(["pending", "sent", "paid", "cancelled"]),
});

export const bookingDetailSchema = bookingSummarySchema.extend({
  provider: z.string(),
  providerReservationId: z.string().nullable(),
  /**
   * Where the customer completes the crew list on the provider's own site, when the
   * provider hosts one. Safe to return here precisely because it is a link and not a
   * manifest: it carries no passenger data, so the §10 rule the travellers are held
   * back by does not apply to it. Null when the provider hosts no such page, or when
   * the booking predates the connector reading it.
   */
  crewListLink: z.string().nullable(),
  holdExpiresAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  /** How the yacht was crewed, as priced. Null for a quote taken before the ask. */
  crewType: z.string().nullable(),
  priceLines: z.array(bookingPriceLineSchema),
  extras: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      pricingType: z.string().nullable(),
      amount: moneySchema.nullable(),
    }),
  ),
  paymentPolicy: z.object({
    mode: z.enum(["deposit", "full"]),
    depositPct: z.number(),
    balanceDueAt: z.string().nullable(),
  }),
  /**
   * What checkout actually charges up front, from the same `amountDue` the payment
   * uses. Deriving it from the policy and the total instead overstates it by the
   * lines marked pay-at-check-in, which are settled with the base and never charged.
   */
  dueNow: moneySchema,
  paymentSchedule: z.array(bookingScheduleEntrySchema),
  payments: z.array(bookingPaymentSchema),
  /**
   * The most recent bank-transfer request, when the customer asked to be invoiced.
   *
   * Narrower than the admin detail's `invoiceRequestSchema` on purpose. What a customer-facing
   * screen needs is which document it is, what it is for and by when — the billed party, the
   * seller's tax details and the bank account belong to the printable document, and
   * `booking.invoice` already assembles those. Repeating them here would put a second copy of a
   * tax record on an endpoint that has no use for it.
   *
   * Most recent rather than open: a deposit-policy charter is invoiced twice, and a screen that
   * wants to know whether money is outstanding reads `status` rather than being handed only the
   * rows that happen to be unpaid.
   */
  invoice: bookingInvoiceSchema.nullable(),
});

/* --------------------------------------------------------------- travellers */

/**
 * One person aboard. §10 keeps these out of every other procedure and out of the
 * logs, so they are read and written only through `booking.travellers.*`, and the
 * identity-document fields are encrypted at rest.
 */
export const travellerSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  role: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  documentNumber: z.string().nullable(),
  nationality: z.string().nullable(),
});

export const travellerInputSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  /** Free text: "skipper", "guest", whatever the charter base asks for. */
  role: z.string().trim().max(64).optional(),
  dateOfBirth: z.iso.date().optional(),
  documentNumber: z.string().trim().max(64).optional(),
  /** ISO 3166-1 alpha-2, as the crew list forms want it. */
  nationality: z.string().trim().length(2).toUpperCase().optional(),
});

export const travellerListInputSchema = z.object({ bookingId: idSchema });

export const travellerListSchema = z.object({
  bookingId: z.string(),
  travellers: z.array(travellerSchema),
});

/**
 * The whole crew list in one call. A partial update would need the client to
 * track row ids across a form that adds and removes people, and a resubmitted
 * form would duplicate the list; replacing is idempotent.
 */
export const travellerSaveInputSchema = z.object({
  bookingId: idSchema,
  travellers: z.array(travellerInputSchema).max(50),
});

export const bookingCancelInputSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});

export const bookingCancelSchema = z.object({
  id: z.string(),
  status: bookingStatusSchema,
  /*
   * False when we cancelled our side and the provider kept the reservation. Booking Manager
   * refuses to release a confirmed one through the API, so the charter stands with the operator
   * and has to be settled by hand before any refund is paid. Reporting the cancellation without
   * this would have us return the guest's money on a charter we are still being billed for.
   */
  providerReleased: z.boolean(),
  /** The provider's refusal, verbatim. Null for a customer, who is owed no vendor detail. */
  providerReleaseError: z.string().nullable(),
});

/*
 * The staff-side booking list. Deliberately not `bookingListSchema`: that one carries the whole
 * listing card because My Bookings renders one, and a queue staff work through needs the
 * customer and the money instead. `status` is a list so one call answers "everything owing a
 * refund" without the caller making two.
 */
export const bookingAdminListInputSchema = z
  .object({
    status: z.array(bookingStatusSchema).min(1).optional(),
    /** Matches a reference, a customer name or their email. */
    query: z.string().trim().max(200).optional(),
    /**
     * Bring back the bookings someone marked as not real business. Off by
     * default, so every staff queue and every total is the real book of business
     * without each caller having to remember to ask.
     */
    includeExcluded: z.boolean().default(false),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: 20 }),
  })
  .default({ ...paginationInputDefault(20), includeExcluded: false });

export const bookingAdminRowSchema = z.object({
  id: z.string(),
  reference: z.string(),
  status: bookingStatusSchema,
  customerName: z.string().nullable(),
  customerEmail: z.string(),
  listingTitle: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  total: moneySchema,
  /** What was actually collected — on a refund queue this is the sum at stake. */
  paid: moneySchema,
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  /** When someone marked this as not real business. Null on an ordinary booking. */
  excludedAt: z.string().nullable(),
  excludedReason: z.string().nullable(),
  createdAt: z.string(),
});

export const bookingAdminListSchema = paginatedSchema(bookingAdminRowSchema);

export const bookingExcludeInputSchema = z.object({
  id: z.string().min(1),
  /** False restores it to the queues and the totals. */
  excluded: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export const bookingExcludeSchema = z.object({
  bookingId: z.string(),
  excludedAt: z.string().nullable(),
  excludedReason: z.string().nullable(),
});

export const bookingExcludeByCompanyInputSchema = z.object({
  /** Provider code, as `booking.provider` stores it: "nausys" or "booking_manager". */
  provider: z.string().min(1),
  /** The vendor's own charter company id, as `listing_source.external_company_id` holds it. */
  externalCompanyId: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
  /**
   * Report what would change without changing it. Defaults to a dry run: this is
   * the one action here that touches many rows at once, and finding out how many
   * must not require having already done it.
   */
  apply: z.boolean().default(false),
});

export const bookingExcludeByCompanySchema = z.object({
  provider: z.string(),
  externalCompanyId: z.string(),
  applied: z.boolean(),
  /** Bookings the filter matched and that were not already excluded. */
  matched: z.number().int(),
  references: z.array(z.string()),
});

export const bookingRefundInputSchema = z.object({
  id: z.string().min(1),
  /**
   * Return only this much. Omitted returns everything collected. Until a cancellation policy is
   * modelled, what a booking retains is a decision staff make and this records.
   */
  amountMinor: z.number().int().positive().optional(),
  reason: z.string().trim().max(500).optional(),
  /**
   * Staff confirming they have sent the bank transfer back. Nothing else can
   * evidence it, so the booking cannot reach REFUNDED on that path without it.
   */
  manualTransferSettled: z.boolean().optional(),
});

export const bookingRefundSchema = z.object({
  bookingId: z.string(),
  status: bookingStatusSchema,
  refunded: moneySchema,
  awaitingSettlement: z.number().int(),
  requiresManualTransfer: z.number().int(),
  /** What the booking still owes back, so a partial refund can be topped up later. */
  outstanding: moneySchema,
});

/* ------------------------------------------------------------------ checkout */

/** Step 1 of the accordion, submitted with Confirm Booking rather than on its own. */
export const guestDetailsSchema = z.object({
  fullName: z.string().trim().min(1).max(200),
  email: z.email(),
  phone: z.string().trim().min(3).max(32),
  /**
   * ISO 3166-1 alpha-2. Required rather than optional: NauSYS lists country among
   * the minimum client fields and answers INSUFFICIENT_DATA (201) without one, so
   * a checkout that omits it only fails once the customer presses pay.
   */
  countryCode: z.string().trim().length(2).toUpperCase(),
  specialRequests: z.string().trim().max(2000).optional(),
});

/**
 * The two Review & Book checkboxes. Literal `true` rather than boolean on purpose:
 * an unticked box is a validation failure server-side, not something the client is
 * trusted to enforce.
 */
export const consentsSchema = z.object({
  terms: z.literal(true),
  cancellationPolicy: z.literal(true),
});

export const checkoutCreateHoldInputSchema = z.object({
  quoteId: z.string().min(1),
  guest: guestDetailsSchema,
  consents: consentsSchema,
  /** Supplied by the client so a retried submit cannot create a second booking. */
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export const checkoutHoldSchema = z.object({
  bookingId: z.string(),
  reference: z.string(),
  status: bookingStatusSchema,
  holdExpiresAt: z.string().nullable(),
  /** False when the provider has no option support and the hold step was skipped. */
  optionHeld: z.boolean(),
  /**
   * Returned once, and only to a guest: the caller must keep it to reach the rest of
   * its own checkout. Null when the booking was made from a session, which already
   * authorises those calls.
   *
   * Nothing here says whether an account already existed for the email. It would be
   * the one field in the app that answers "is this address registered?", and the
   * guest UI has no use for the answer.
   */
  accessToken: z.string().nullable(),
});

export const checkoutStatusInputSchema = z.object({
  bookingId: z.string().min(1),
  accessToken: guestAccessTokenSchema.optional(),
});

export const checkoutStatusSchema = z.object({
  bookingId: z.string(),
  reference: z.string(),
  status: bookingStatusSchema,
  holdExpiresAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  providerReservationId: z.string().nullable(),
  /** Set when the booking failed, so the confirmation screen can explain why. */
  failureReason: z.string().nullable(),
});

/* --------------------------------------------- non-card checkout outcomes */

/*
 * Who the invoice is made out to. An invoice is a tax document, so the billed party needs a name
 * and a postal address whether or not a company is involved; the company block (name, VAT,
 * registration) is what turns it into a B2B invoice and stays optional.
 */
export const billingPartySchema = z.object({
  billingEmail: z.email(),
  billingName: z.string().trim().min(2).max(200),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(120).optional(),
  postalCode: z.string().trim().min(1).max(32).optional(),
  countryCode: z.string().trim().length(2).toUpperCase(),
  companyName: z.string().trim().max(200).optional(),
  vatNumber: z.string().trim().max(64).optional(),
  registrationNumber: z.string().trim().max(64).optional(),
});

export const invoiceRequestInputSchema = billingPartySchema.extend({
  bookingId: z.string().min(1),
  accessToken: guestAccessTokenSchema.optional(),
});

export const invoiceRequestSchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  number: z.string(),
  issuedAt: z.string(),
  dueAt: z.string(),
  billingEmail: z.string(),
  billingName: z.string().nullable(),
  companyName: z.string().nullable(),
  vatNumber: z.string().nullable(),
  registrationNumber: z.string().nullable(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  countryCode: z.string().nullable(),
  amount: moneySchema,
  status: z.enum(["pending", "sent", "paid", "cancelled"]),
  bookingStatus: bookingStatusSchema,
  createdAt: z.string(),
});

/**
 * What staff see on one booking.
 *
 * Not `bookingDetailSchema`: that one is the customer's own card, carrying the listing gallery,
 * amenities and badges a support screen has no use for, and it is missing the two things this
 * one exists to show — who the booking belongs to, and every payment against it with its method
 * and dispute state.
 *
 * Travellers stay out, for the same reason §10 keeps them off the customer endpoint. Passport
 * and crew data is encrypted at rest and read only through `booking.travellers.*`; a screen for
 * settling money has no business widening that.
 */
/** Staff address a booking by id alone — no guest token, and no ownership to prove. */
export const adminBookingIdInputSchema = z.object({ id: idSchema });

export const bookingAdminDetailSchema = bookingAdminRowSchema.extend({
  provider: z.string(),
  providerReservationId: z.string().nullable(),
  /*
   * The provider's own last word on the reservation, which is not ours to infer. Read against
   * `status`: a cancelled booking still reading `confirmed` or `option_held` here is one the
   * vendor never let go of, and staff have to settle that by hand before the refund is paid.
   */
  providerStatus: z.string().nullable(),
  holdExpiresAt: z.string().nullable(),
  confirmedAt: z.string().nullable(),
  crewType: z.string().nullable(),
  guests: z.number().int(),
  /** True when the account was provisioned at checkout and has never been signed into. */
  isGuestAccount: z.boolean(),
  base: z.object({
    name: z.string(),
    locationName: z.string(),
    countryName: z.string(),
  }),
  priceLines: z.array(bookingPriceLineSchema),
  paymentSchedule: z.array(bookingScheduleEntrySchema),
  payments: z.array(bookingPaymentSchema),
  /** The bank-transfer request behind a PAYMENT_PENDING booking, when there is one. */
  invoice: invoiceRequestSchema.nullable(),
});

/*
 * Everything the printable invoice renders, assembled server-side so the document is one
 * authoritative payload: the seller block, the billed party as it was captured, the priced lines
 * behind the charter, what is due now, and where to wire the money. `null` when the booking has
 * no invoice request — the customer paid by card.
 */
export const invoiceDocumentSchema = z
  .object({
    number: z.string(),
    issuedAt: z.string(),
    dueAt: z.string(),
    status: z.enum(["pending", "sent", "paid", "cancelled"]),
    seller: z.object({
      legalName: z.string(),
      tradingName: z.string(),
      addressLine1: z.string(),
      addressLine2: z.string().nullable(),
      city: z.string(),
      postalCode: z.string(),
      countryCode: z.string(),
      vatNumber: z.string(),
      registrationNumber: z.string(),
      email: z.string(),
      phone: z.string(),
      website: z.string(),
    }),
    billTo: z.object({
      name: z.string(),
      email: z.string(),
      companyName: z.string().nullable(),
      vatNumber: z.string().nullable(),
      registrationNumber: z.string().nullable(),
      addressLine1: z.string().nullable(),
      addressLine2: z.string().nullable(),
      city: z.string().nullable(),
      postalCode: z.string().nullable(),
      countryCode: z.string().nullable(),
    }),
    booking: z.object({
      reference: z.string(),
      status: bookingStatusSchema,
      listingTitle: z.string(),
      baseName: z.string(),
      locationName: z.string(),
      countryName: z.string(),
      checkIn: z.string(),
      checkOut: z.string(),
      guests: z.number().int(),
    }),
    lines: z.array(
      z.object({
        code: z.string(),
        label: z.string(),
        amount: moneySchema,
        payWhen: z.enum(["now", "at_check_in"]),
        group: lineGroupSchema.nullable(),
      }),
    ),
    total: moneySchema,
    /** The invoiced figure, frozen when the request was made — not recomputed from the quote. */
    amountDue: moneySchema,
    paidTotal: moneySchema,
    balanceDue: moneySchema,
    securityDeposit: moneySchema.nullable(),
    payment: z.object({
      bankName: z.string(),
      iban: z.string(),
      bic: z.string(),
      /** What the payer must put on the transfer so it can be matched without a human. */
      reference: z.string(),
    }),
  })
  .nullable();

export const enquiryInputSchema = z.object({
  bookingId: z.string().min(1),
  question: z.string().trim().min(1).max(2000),
  accessToken: guestAccessTokenSchema.optional(),
});

export const enquirySchema = z.object({
  id: z.string(),
  bookingId: z.string(),
  question: z.string(),
  status: z.enum(["open", "answered", "closed"]),
  answer: z.string().nullable(),
  answeredAt: z.string().nullable(),
  /** Unchanged by asking — a question is not a commitment to pay. */
  bookingStatus: bookingStatusSchema,
  createdAt: z.string(),
});

/** Data for "Download Receipt"; the PDF itself is rendered client-side. */
export const bookingReceiptSchema = z.object({
  reference: z.string(),
  issuedAt: z.string(),
  status: bookingStatusSchema,
  guest: z.object({
    fullName: z.string().nullable(),
    email: z.string().nullable(),
  }),
  listingTitle: z.string(),
  baseName: z.string(),
  locationName: z.string(),
  countryName: z.string(),
  checkIn: z.string(),
  checkOut: z.string(),
  guests: z.number().int(),
  lines: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      amount: moneySchema,
      payWhen: z.enum(["now", "at_check_in"]),
      group: lineGroupSchema.nullable(),
    }),
  ),
  total: moneySchema,
  securityDeposit: moneySchema.nullable(),
  paidTotal: moneySchema,
  balanceDue: moneySchema,
  payments: z.array(
    z.object({
      kind: paymentScheduleKindSchema,
      amount: moneySchema,
      status: paymentStatusSchema,
      paidAt: z.string().nullable(),
    }),
  ),
});

export const checkoutConfirmInputSchema = z.object({
  bookingId: z.string().min(1),
  /** Overrides the quote's own policy when the customer chooses to pay in full. */
  paymentPreference: z.enum(["deposit", "full"]).default("deposit"),
  accessToken: guestAccessTokenSchema.optional(),
});

/**
 * Settling what is left on a confirmed charter. No preference: the amount is whatever
 * the booking still owes, which is the total less what has actually been paid.
 */
export const checkoutPayBalanceInputSchema = z.object({
  bookingId: z.string().min(1),
  accessToken: guestAccessTokenSchema.optional(),
});

export const checkoutConfirmSchema = z.object({
  bookingId: z.string(),
  status: bookingStatusSchema,
  paymentId: z.string(),
  amount: moneySchema,
  kind: paymentScheduleKindSchema,
  /** Handed to Stripe Elements in the browser; never stored server-side. */
  clientSecret: z.string(),
});

/* --------------------------------------------------- invoice administration */

export const invoiceListInputSchema = z
  .object({
    status: z.enum(["pending", "sent", "paid", "cancelled"]).optional(),
    ...paginationInputSchema({ maxPageSize: 100, defaultPageSize: 20 }),
  })
  .default(paginationInputDefault(20));

export const invoiceAdminRowSchema = invoiceRequestSchema.extend({
  reference: z.string(),
  guestName: z.string().nullable(),
  listingTitle: z.string(),
  settledAt: z.string().nullable(),
});

export const invoiceListSchema = paginatedSchema(invoiceAdminRowSchema);

export const invoiceSettleInputSchema = z.object({
  id: z.string().min(1),
  /** What actually landed, when it differs from the amount invoiced. */
  amountMinor: z.number().int().min(0).optional(),
  note: z.string().trim().max(500).optional(),
});

export const invoiceSettleSchema = z.object({
  invoice: invoiceAdminRowSchema,
  bookingStatus: bookingStatusSchema,
  /** Set when the provider refused after the money arrived. */
  providerRejection: z.string().nullable(),
});

export const invoiceCancelInputSchema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});
