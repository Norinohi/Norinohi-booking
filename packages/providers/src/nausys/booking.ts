import { booking } from "@yacht-charter/db/schema/booking";
import { and, eq } from "drizzle-orm";
import { log, parseError } from "evlog";
import { z } from "zod";

import type { JsonObject } from "../shared/json";

import type { Database } from "../registry";
import type { CatalogueResolver } from "../shared/catalogue-resolver";
import { formatNausysDate, parseNausysDate, parseNausysDateTime } from "../shared/dates";
import { ContractError } from "../shared/errors";
import {
  baseExtraCode,
  formatExtraCode,
  parseExtraCode,
  type ExtraKind,
} from "../shared/extra-code";
import { thrownFields } from "../shared/log-fields";
import { DEFAULT_LINE_LABELS } from "../shared/generic-labels";
import { decimalStringToMinor, minorToDecimalString } from "../shared/money";
import { stableSourceHash } from "../shared/raw-retention";
import {
  createReservationEventRecorder,
  type ReservationEventKind,
  type ReservationEventRecorder,
} from "../shared/reservation-log";
import {
  bookingDraftSchema,
  providerExtrasMutationSchema,
  providerQuoteSchema,
  providerReservationRefSchema,
  providerReservationSchema,
  type BookingDraft,
  type ProviderExtrasMutation,
  type ProviderQuote,
  type ProviderReservation,
  type ProviderReservationRef,
} from "../types";
import { type NausysClient, reservationLane } from "./client";
import type { NausysConfig } from "./config";
import { extraLineMinor, internationalText } from "./extras";
import type { BilledExtraRow } from "./quote";
import {
  crewListLinkOf,
  nausysEndpoints,
  restListedExtrasSchema,
  restYachtReservationResponseSchema,
  restYachtReservationSchema,
  type RestClient,
  type RestYachtReservation,
} from "./endpoints";

const PROVIDER = "nausys" as const;

/**
 * Re-prices the draft against the provider and returns the price source hash of
 * what is on offer right now, with the offer rows that price bills. Injected rather
 * than imported so this file stays independent of the quote module, and so the
 * refusal path is testable without a second endpoint in play.
 */
export type VerifyPrice = (draft: BookingDraft) => Promise<PriceCheck>;

export interface PriceCheck {
  hash: string;
  /**
   * The crew and ticked extras the quote bills, by the season price row `addExtras` takes.
   * The option opens with none of them, so without this the operator held a charter with no
   * skipper and no transfer while we took the customer's money for both.
   */
  billedRows: readonly BilledExtraRow[];
  /**
   * What the quote charged for extras, obligatory and chosen, in minor units of the charter's
   * currency. The hold compares the reservation's own figure with it.
   */
  extrasMinor?: number;
}

/**
 * Receives every refreshed uuid. `addOrUpdateExtras` returns a `ProviderQuote`,
 * which has nowhere to carry a security token, so without this the rotation on
 * that path would be dropped and every later call on the booking would fail.
 */
export type SecurityTokenSink = (rotation: {
  providerReservationId: string;
  securityToken: string;
}) => Promise<void>;

/**
 * Writes down the reservation the INFO step just opened, against the quote that opened it.
 *
 * Separate from `SecurityTokenSink` because there is nothing to key a rotation on yet: the
 * booking carries no `provider_reservation_id` until the hold succeeds, so a sink that matches
 * on it updates no rows. This one finds the booking by our own quote id, the way the event
 * recorder does.
 */
export type OpenedReservationSink = (opened: {
  quoteId: string;
  providerReservationId: string;
  securityToken: string;
}) => Promise<void>;

export interface NausysBookingServiceDeps {
  client: NausysClient;
  resolver: CatalogueResolver;
  config: NausysConfig;
  db: Database;
  verifyPrice: VerifyPrice;
  recordEvent?: ReservationEventRecorder;
  persistSecurityToken?: SecurityTokenSink;
  persistOpenedReservation?: OpenedReservationSink;
  /**
   * Reads the reservation's current extras so a desired set can be diffed against them.
   *
   * Overridable, and defaulted to `listExtras` -- the vendor's own single-reservation read,
   * added in October 2025. Before it existed the only source was the response of the last
   * mutation, and nothing supplied one: the diff therefore saw an empty reservation, found
   * nothing to remove, and left a deselected extra on the booking still being billed.
   */
  loadReservationExtras?: (ref: ProviderReservationRef) => Promise<ReservationExtra[]>;
  /** The rows a reservation can still take, where `loadReservationExtras` is overridden. */
  loadAvailableExtras?: (ref: ProviderReservationRef) => Promise<AvailableExtra[]>;
  /** Every crew role's service id for a listing, whose lines an extras edit never removes. */
  loadCrewRoleServiceIds?: (listingId: string) => Promise<ReadonlySet<string>>;
  /** The listing's extra names by canonical code, for the lines a mutation's reprice returns. */
  loadExtraLabels?: (listingId: string) => Promise<ReadonlyMap<string, string>>;
  /**
   * The listing's extras the operator sells only on a fixed reservation (`onRequestOnly`: "If
   * true service is available only on YachtReservation type RESERVATION"). They go on after
   * createBooking rather than on the option, where the vendor may refuse them and the refusal
   * would release a hold the customer had done nothing wrong to lose.
   */
  loadOnRequestCodes?: (listingId: string) => Promise<ReadonlySet<string>>;
}

/** One extra already on the reservation, as the vendor's own response describes it. */
export interface ReservationExtra {
  /** The reservation line id, which is what `updateExtras` addresses. */
  yachtReservationServiceId: number;
  /** The catalogue service (or, for equipment, the equipment) the line was created from. */
  serviceId: number;
  quantity: number;
  /** False when the operator has locked the line; we cannot change it. */
  editable: boolean;
  /** Absent means a service line; equipment lines are addressed by their own update key. */
  kind?: ExtraKind;
  /** A line the customer never chose and cannot drop. */
  obligatory?: boolean;
  /** The operator's condition on the line, which says which variant it is. */
  condition?: string | null;
  /** Not charged yet: the operator has not released the season quantity it was added against. */
  pending?: boolean;
}

export interface NausysBookingService {
  createOption(draft: BookingDraft): Promise<ProviderReservation>;
  confirmBooking(draft: BookingDraft): Promise<ProviderReservation>;
  cancelOption(ref: ProviderReservationRef): Promise<ProviderReservation>;
  addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote>;
}

/** `{id, uuid}` as the vendor wants them: the uuid is only valid for one call. */
interface ReservationHandle {
  id: number;
  uuid: string;
}

interface ReservationStep {
  response: RestYachtReservation;
  /** The uuid the vendor just issued, never the one we sent. */
  handle: ReservationHandle;
}

/** The one call that has no reservation yet, so nothing to authenticate against. */
const OPENS_RESERVATION = "opens-reservation" as const;

export function createNausysBookingService(deps: NausysBookingServiceDeps): NausysBookingService {
  const { client, resolver, config, db, verifyPrice } = deps;
  const recordEvent = deps.recordEvent ?? createReservationEventRecorder(db, PROVIDER);
  const persistSecurityToken = deps.persistSecurityToken ?? createSecurityTokenSink(db);
  const persistOpenedReservation = deps.persistOpenedReservation ?? createOpenedReservationSink(db);

  /**
   * The uuid funnel: the only way this file issues a booking call.
   *
   * NauSYS rotates the per-reservation `uuid` whenever anything important about
   * the reservation changes, and a call carrying a stale one is refused. So the
   * funnel owns both ends of that token. It refuses to call at all without a
   * usable handle, it writes `id` and `uuid` into the body itself rather than
   * trusting each call site to remember, and it hands back the refreshed handle
   * so the caller persists it alongside the state change it just made.
   *
   * The endpoint and body are parameters rather than a callback for that middle
   * reason: a callback that builds its own body can forget the uuid, and a path
   * that mutates a reservation without writing the new uuid back breaks every
   * later call on that booking, with a failure that only surfaces hours later.
   */
  async function withReservation(
    ref: ProviderReservationRef | typeof OPENS_RESERVATION,
    endpoint: string,
    body: JsonObject = {},
  ): Promise<ReservationStep> {
    const current = ref === OPENS_RESERVATION ? null : requireHandle(ref, endpoint);

    const response = await client.bookingCall(
      endpoint,
      restYachtReservationResponseSchema,
      current ? { ...body, id: current.id, uuid: current.uuid } : body,
      // Per reservation, because the token this funnel exists to manage is per
      // reservation: two calls in flight on one of them would both carry the uuid
      // that only the first of them is still allowed to use. A call that opens a
      // reservation has none yet and needs no lane.
      current ? reservationLane(String(current.id)) : undefined,
    );

    if (current && response.id !== current.id) {
      throw new ContractError(
        `NauSYS ${endpoint} answered for reservation ${response.id}, not ${current.id}`,
        { endpoint, payload: { requested: current.id, returned: response.id } },
      );
    }

    const handle = refreshedHandle(response, endpoint);

    // Deliberately not best-effort: a rotation we failed to store leaves the
    // reservation unreachable, so failing at the call that rotated it is the
    // earliest and loudest place to find out.
    if (current) {
      await persistSecurityToken({
        providerReservationId: String(handle.id),
        securityToken: handle.uuid,
      });
    }

    return { response, handle };
  }

  /**
   * Our single hold collapses the vendor's first two steps. INFO creates the
   * reservation and blocks nothing; OPTION is what actually takes the yacht off
   * the market and is the only step that returns an expiry.
   */
  async function createOption(draft: BookingDraft): Promise<ProviderReservation> {
    const parsed = bookingDraftSchema.parse(draft);

    // Before anything is created: `freeYachts` leaves no provider-side artifact,
    // so this hash is the only link between the price the customer accepted and
    // the reservation about to be opened.
    const check = await verifyPrice(parsed);
    const current = check.hash;
    if (current !== parsed.priceSourceHash) {
      throw new ContractError(
        "PRICE_CHANGED: the NauSYS price moved between the quote and the hold",
        {
          endpoint: nausysEndpoints.booking.createInfo,
          providerCode: "PRICE_CHANGED",
          payload: { expected: parsed.priceSourceHash, actual: current },
        },
      );
    }

    const yachtId = await externalYachtId(parsed.listingId);
    const countryId = await externalCountryId(parsed.customer.countryCode);

    const info = await withReservation(OPENS_RESERVATION, nausysEndpoints.booking.createInfo, {
      client: toRestClient(parsed.customer, countryId),
      periodFrom: formatNausysDate(parsed.checkIn),
      periodTo: formatNausysDate(parsed.checkOut),
      yachtID: yachtId,
      // The party the quote priced per-head extras for; see `restCreateInfoRequestSchema`.
      numberOfGuests: parsed.guests,
      /* Our discount, so the operator's reservation carries the price the client pays rather
         than the list price. Money, never a share, so there is nothing for the vendor to
         recompute. */
      ...(parsed.clientDiscount && parsed.clientDiscount.amountMinor > 0
        ? {
            agencyClientDiscountAmount: minorToDecimalString(
              parsed.clientDiscount.amountMinor,
              parsed.clientDiscount.currency,
            ),
            agencyClientDiscountAmountType: "AMOUNT",
          }
        : null),
    });

    // A failure after this point leaves an INFO record behind. It holds no yacht,
    // so it is logged and left alone: a compensating storno would be a second
    // provider call on an object that costs nothing to abandon.
    await logEvent(parsed.quoteId, "info_created", info);
    /*
     * And the handle it opened, before anything can fail.
     *
     * The uuid rotates on every change and is the only way back to a reservation, and it was
     * stored only once the hold succeeded. A `createOption` refused after this point therefore
     * left an INFO record at the vendor carrying the customer's name, email and phone, with no
     * key on our side to reach it again -- not even to ask for it to be removed.
     */
    await persistOpenedReservation({
      quoteId: parsed.quoteId,
      providerReservationId: String(info.handle.id),
      securityToken: info.handle.uuid,
    });

    /*
     * `createWaitingOption` is a STRING on the vendor's side, not a boolean. A JSON `false`
     * crashes their JSON-B deserializer before any handler runs — Payara answers HTTP 500 with
     * an HTML error page whose root cause is `JsonParser#getString() ... current parser state
     * is VALUE_FALSE`. Verified against the live API: `"false"` returns a normal OPTION.
     */
    const option = await withReservation(refOf(info.handle), nausysEndpoints.booking.createOption, {
      createWaitingOption: "false",
      fallbackToWaitingOption: false,
    });

    await logEvent(parsed.quoteId, "option_created", option);
    /*
     * An option the operator still has to approve by hand. The catalogue's needsOptionApproval
     * already routes such hulls to a request, so this is the case where the two disagree: the
     * hold stands, but the customer is about to pay against a week nobody has said yes to.
     */
    if (option.response.approved === false) {
      log.warn({
        action: "nausys.option_awaiting_approval",
        quoteId: parsed.quoteId,
        providerReservationId: String(option.handle.id),
        yachtId: option.response.yachtId,
      });
    }

    const onRequest = (await deps.loadOnRequestCodes?.(parsed.listingId)) ?? new Set<string>();
    const held = await addBilledExtras(
      parsed.quoteId,
      option,
      check.billedRows.filter((row) => !onRequest.has(baseExtraCode(row.code))),
    );
    const reservationId = String(held.handle.id);
    reportExtrasDrift(parsed.quoteId, held.response, check.extrasMinor);

    return providerReservationSchema.parse({
      id: reservationId,
      provider: PROVIDER,
      listingId: parsed.listingId,
      quoteId: parsed.quoteId,
      status: toCanonicalStatus(option.response.reservationStatus),
      // NauSYS carries one numeric id through the whole chain, so the option and
      // the reservation are the same handle.
      providerReservationId: reservationId,
      providerOptionId: reservationId,
      /* The latest handle: `addExtras` rotates the uuid, and only the newest one still works. */
      securityToken: held.handle.uuid,
      holdExpiresAt: holdExpiresAt(option.response),
      crewListLink: crewListLinkOf(held.response) ?? crewListLinkOf(option.response),
    });
  }

  /**
   * Puts the charter's crew and ticked extras on the option, by their season price rows.
   *
   * `createInfo` takes no extras, so the option opens as a bare charter. A refusal here
   * releases the option again and fails the hold: a reservation the base reads as having no
   * skipper and no transfer, beside a payment that covered both, is worse than asking the
   * customer to try again.
   */
  async function addBilledExtras(
    quoteId: string,
    option: ReservationStep,
    rows: readonly BilledExtraRow[],
  ): Promise<ReservationStep> {
    if (rows.length === 0) return option;

    try {
      const added = await withReservation(
        refOf(option.handle),
        nausysEndpoints.booking.addExtras,
        rowAdditions(rows),
      );
      await logEvent(quoteId, "extras_updated", added);
      reportPendingExtras(quoteId, added.response);
      return added;
    } catch (error) {
      await releaseAfterFailedExtras(option);
      throw new ContractError(
        `NauSYS refused the extras for reservation ${option.handle.id}: ${rows.map((row) => row.code).join(", ")}`,
        { endpoint: nausysEndpoints.booking.addExtras, cause: error },
      );
    }
  }

  /**
   * The on-request extras the customer chose, put on the reservation now that it is one.
   *
   * The offer that priced them is gone (the yacht is ours, so freeYachts no longer answers for
   * it), so the rows come from the reservation's own `availableExtras`: a variant code names its
   * row, a plain code the one row of its extra. A refusal does not undo the booking, which the
   * customer has paid for; it is logged for a person to arrange with the base.
   */
  async function addOnRequestExtras(
    draft: BookingDraft,
    booked: ReservationStep,
  ): Promise<ReservationStep> {
    const onRequest = (await deps.loadOnRequestCodes?.(draft.listingId)) ?? new Set<string>();
    const wanted = draft.extras.filter((code) => onRequest.has(baseExtraCode(code)));
    if (wanted.length === 0) return booked;

    try {
      const listed = await client.bookingCall(
        nausysEndpoints.availability.listExtras,
        restListedExtrasSchema,
        { id: booked.handle.id, uuid: booked.handle.uuid },
        reservationLane(String(booked.handle.id)),
      );
      const rows = rowsForCodes(wanted, listed.availableExtras ?? []);
      if (rows.length === 0) throw new Error("none of them is available on the reservation");

      const added = await withReservation(
        refOf(booked.handle),
        nausysEndpoints.booking.addExtras,
        rowAdditions(rows),
      );
      await logEvent(draft.quoteId, "extras_updated", added);
      reportPendingExtras(draft.quoteId, added.response);
      return added;
    } catch (error) {
      log.warn({
        action: "nausys.on_request_extras_not_added",
        quoteId: draft.quoteId,
        providerReservationId: String(booked.handle.id),
        extras: wanted.join(", "),
        ...thrownFields(parseError(error)),
      });
      return booked;
    }
  }

  /**
   * Best effort: the hold is failing either way, and a storno that also fails leaves an option
   * the vendor expires on its own clock.
   */
  async function releaseAfterFailedExtras(option: ReservationStep): Promise<void> {
    try {
      await withReservation(refOf(option.handle), nausysEndpoints.booking.stornoOption);
    } catch {
      /* Nothing more to do here; the refusal above is what the caller needs to hear. */
    }
  }

  async function confirmBooking(draft: BookingDraft): Promise<ProviderReservation> {
    const parsed = bookingDraftSchema.parse(draft);

    if (!parsed.reservation) {
      throw new ContractError(
        "NauSYS createBooking needs the reservation the option step opened; the draft carries none",
        { endpoint: nausysEndpoints.booking.createBooking },
      );
    }

    const booked = await withReservation(parsed.reservation, nausysEndpoints.booking.createBooking);

    await logEvent(parsed.quoteId, "confirm_succeeded", booked);

    const step = await addOnRequestExtras(parsed, booked);
    const reservationId = String(step.handle.id);

    return providerReservationSchema.parse({
      id: reservationId,
      provider: PROVIDER,
      listingId: parsed.listingId,
      quoteId: parsed.quoteId,
      status: toCanonicalStatus(step.response.reservationStatus),
      providerReservationId: reservationId,
      providerOptionId: parsed.reservation.providerOptionId ?? reservationId,
      securityToken: step.handle.uuid,
      // The confirmed reservation is the one whose crew list the base will ask for,
      // so this is the response the link actually matters on.
      crewListLink: crewListLinkOf(step.response),
    });
  }

  async function cancelOption(ref: ProviderReservationRef): Promise<ProviderReservation> {
    const parsed = providerReservationRefSchema.parse(ref);
    const step = await withReservation(parsed, nausysEndpoints.booking.stornoOption);

    return providerReservationSchema.parse({
      id: String(step.handle.id),
      provider: PROVIDER,
      // The storno response links back to the yacht but not to our quote; the
      // caller already holds both and only reads the status and the token here.
      listingId: (await resolver.toListingId(String(step.response.yachtId))) ?? "",
      quoteId: "",
      status: toCanonicalStatus(step.response.reservationStatus),
      providerReservationId: String(step.handle.id),
      securityToken: step.handle.uuid,
    });
  }

  /**
   * Reconciles the reservation's extras with the set the customer chose.
   *
   * NauSYS confirmed (Aug 2026) that `updateExtras` is a PARTIAL update: "only
   * extra id that you send in the request will be updated, others will remain the
   * same". Sending the desired set therefore does not remove anything, which is
   * how a deselected extra would have stayed on the booking and kept being billed.
   *
   * So the set is diffed instead, against the reservation's own `listExtras`: the lines it
   * carries, and the season price rows it can still take (`availableExtras`), which is where an
   * addition's row id comes from. Re-pricing the charter cannot answer that on a live hold:
   * freeYachts no longer reports a yacht we hold, so the edit refused every reservation (seen
   * live on the vendor's test company, Sep 2026). A code whose row is still available is an
   * addition; one whose extra is already on the reservation is kept; one that is neither is
   * refused rather than dropped. Crew lines belong to the crew type, which this does not edit,
   * so they are left alone.
   *
   * Removal has no endpoint of its own: NauSYS confirmed (Aug 2026) that setting a
   * line's `quantity` to 0 through `updateExtras` drops it from the info and the
   * option. Obligatory lines are never touched: the customer did not choose them and cannot
   * drop them. A line the operator locked (`editable: false`) cannot be removed, so a removal
   * it blocks fails here rather than silently keeping a deselected extra on the bill. And
   * extras cannot be edited at all once the booking is confirmed; that refusal is the
   * vendor's, since only they know the reservation's current status.
   */
  async function addOrUpdateExtras(input: ProviderExtrasMutation): Promise<ProviderQuote> {
    const parsed = providerExtrasMutationSchema.parse(input);
    const listed = deps.loadReservationExtras
      ? {
          lines: await deps.loadReservationExtras(parsed.ref),
          available: (await deps.loadAvailableExtras?.(parsed.ref)) ?? [],
        }
      : await readListedExtras(client, parsed.ref);
    const current = listed.lines;
    const crew = parsed.charter
      ? ((await deps.loadCrewRoleServiceIds?.(parsed.charter.listingId)) ?? new Set<string>())
      : new Set<string>();

    const remaining = current.filter(
      (line) =>
        line.obligatory !== true &&
        !((line.kind ?? "service") === "service" && crew.has(String(line.serviceId))),
    );
    const additions: BilledExtraRow[] = [];
    const unavailable: string[] = [];
    for (const code of parsed.extras) {
      const [row] = rowsForCodes([code], listed.available);
      const wanted = parseExtraCode(code);
      /* Already on the reservation: the same extra, and for a variant the same condition. */
      const at = remaining.findIndex(
        (line) =>
          wanted !== null &&
          (line.kind ?? "service") === wanted.kind &&
          String(line.serviceId) === wanted.externalId &&
          (row === undefined ||
            row.condition === null ||
            line.condition == null ||
            line.condition === row.condition),
      );
      if (at !== -1) remaining.splice(at, 1);
      else if (row) additions.push(row);
      else unavailable.push(code);
    }
    if (unavailable.length > 0) {
      throw new ContractError(
        `NauSYS reservation ${parsed.ref.providerReservationId} cannot take ${unavailable.join(", ")}`,
        { endpoint: nausysEndpoints.availability.listExtras },
      );
    }
    const removals = remaining;

    const locked = removals.filter((item) => !item.editable);
    if (locked.length > 0) {
      throw new ContractError(
        `NauSYS reservation ${parsed.ref.providerReservationId} has extras the operator locked, ` +
          `so ${locked.map((item) => item.serviceId).join(", ")} cannot be removed`,
        { payload: { locked: locked.map((item) => item.yachtReservationServiceId) } },
      );
    }

    // Removals first: they only ever shrink the reservation, so a later addition
    // that the vendor refuses leaves the customer holding less than they picked
    // rather than being billed for something they deselected.
    let last =
      removals.length === 0
        ? null
        : await withReservation(
            parsed.ref,
            nausysEndpoints.booking.updateExtras,
            lineUpdates(removals, () => 0),
          );

    if (additions.length > 0) {
      last = await withReservation(
        last ? refOf(last.handle) : parsed.ref,
        nausysEndpoints.booking.addExtras,
        rowAdditions(additions),
      );
    }

    // Nothing changed, so nothing is mutated: the price is read back instead. Re-sending
    // each line's quantity through updateExtras used to be the read, and the quantity it
    // resent is units times the price measure, so a per-day line of one became seven.
    if (last === null) {
      return await toProviderQuote(await readReservation(client, parsed.ref));
    }

    await logEventForReservation(parsed.ref.providerReservationId, "extras_updated", last);

    // The mutation answers with the whole reservation, so its price is the
    // re-read: there is no separate booking-side read endpoint.
    return await toProviderQuote(last.response);
  }

  async function externalYachtId(listingId: string): Promise<number> {
    const ref = await resolver.toExternalListing(listingId);
    const yachtId = Number(ref.externalYachtId);
    if (!Number.isInteger(yachtId)) {
      throw new ContractError(
        `Listing ${listingId} maps to a non-numeric NauSYS yacht id: ${JSON.stringify(ref.externalYachtId)}`,
      );
    }
    return yachtId;
  }

  /**
   * `countryId` is a NauSYS id, not an ISO code, so checkout's alpha-2 has to go
   * through the catalogue. An unresolvable code is fatal on purpose: sending the
   * reservation without it earns INSUFFICIENT_DATA (201) at the till, and sending
   * a guessed id would file the charter against the wrong country.
   */
  async function externalCountryId(isoCode: string | undefined): Promise<number | undefined> {
    if (!isoCode) return undefined;

    const external = await resolver.toExternalCountryId(isoCode);
    const numeric = Number(external);
    if (external === null || !Number.isInteger(numeric)) {
      throw new ContractError(`No NauSYS country matches the guest country code ${isoCode}`, {
        endpoint: nausysEndpoints.booking.createInfo,
        payload: { countryCode: isoCode, resolved: external },
      });
    }
    return numeric;
  }

  function holdExpiresAt(response: RestYachtReservation): string {
    if (!response.optionTill) {
      // Without the vendor's own expiry we cannot know when it drops the option,
      // and a hold nothing ever releases would keep the slot unsellable. Loud
      // here beats silently holding phantom inventory.
      throw new ContractError("NauSYS createOption returned no optionTill", {
        endpoint: nausysEndpoints.booking.createOption,
      });
    }

    const till = parseNausysDateTime(response.optionTill, config.optionTimeZone);
    // We must release first: expiring after the provider has already dropped the
    // option means selling a slot that is no longer ours.
    return new Date(till.getTime() - config.optionSafetyMarginMinutes * 60_000).toISOString();
  }

  async function toProviderQuote(response: RestYachtReservation): Promise<ProviderQuote> {
    const currency = response.currency ?? response.paymentCurrency;
    if (!currency || !response.clientPrice) {
      throw new ContractError("NauSYS extras mutation returned no priced reservation", {
        endpoint: nausysEndpoints.booking.updateExtras,
        payload: { id: response.id },
      });
    }

    /* The reservation carries the handover time ("17.10.2026 17:00"), which the date parser
       refused: every extras edit threw after the vendor had already applied it. */
    const checkIn = parseNausysDate(dayOf(response.periodFrom));
    const checkOut = parseNausysDate(dayOf(response.periodTo));
    const baseMinor = decimalStringToMinor(response.clientPrice, currency);

    const listingId = (await resolver.toListingId(String(response.yachtId))) ?? "";
    const labels = listingId ? await deps.loadExtraLabels?.(listingId) : undefined;
    /* A pending line is not charged until the operator releases it, so it is not in the total. */
    const reservationLines = [
      ...(response.services ?? [])
        .filter((extra) => extra.onPending !== true)
        .map((extra) => ({
          extra,
          code: formatExtraCode("service", String(extra.serviceId)),
        })),
      ...(response.additionalEquipment ?? [])
        .filter((extra) => extra.onPending !== true)
        .map((extra) => ({
          extra,
          code: formatExtraCode("equipment", String(extra.equipmentId)),
        })),
    ];
    const extraLines = reservationLines.map(({ extra, code }) => ({
      // The same canonical codes the quote uses, and the catalogue's names for them: the
      // reservation carries ids only. These used to read "nausys:8001", "Service 8001".
      code,
      label: labels?.get(code) ?? DEFAULT_LINE_LABELS.extra,
      ...(extra.obligatory === undefined
        ? null
        : { group: extra.obligatory ? ("mandatory" as const) : ("optional" as const) }),
      // `amount` is the unit price, so a per-person or per-day line billed off it
      // under-charges by its quantity — NauSYS prices a per-person extra at the
      // yacht's full berth count, which on a ten-berth yacht is a tenth of the
      // real figure. `extraLineMinor` is what the quote reads, and the two must
      // agree or the reservation contradicts the invoice built from the quote.
      /* The reservation's own charter price is what a percentage line is a share of. */
      amount: {
        amountMinor: extraLineMinor(extra, currency, {
          clientMinor: baseMinor,
          days: Math.round(
            (Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000,
          ),
        }),
        currency,
      },
      /* As the quote reads it: an absent calculationType is billed at the base, never "now". */
      payWhen:
        extra.calculationType === "SEPARATE_PAYMENT" || extra.calculationType === undefined
          ? ("at_check_in" as const)
          : ("now" as const),
      kind: "extra" as const,
    }));

    const totalMinor = extraLines.reduce((sum, line) => sum + line.amount.amountMinor, baseMinor);
    const policy = paymentPolicyOf(response);

    const quoteInput: z.input<typeof providerQuoteSchema> = {
      id: `qte_${PROVIDER}_${response.id}`,
      provider: PROVIDER,
      listingId,
      providerSourceId: `${PROVIDER}:${response.yachtId}`,
      checkIn,
      checkOut,
      // The reservation carries no crew count; the booking that owns it does.
      guests: 0,
      currency,
      lines: [
        {
          code: "base-charter",
          label: "Charter price",
          amount: { amountMinor: baseMinor, currency },
          kind: "base",
        },
        ...extraLines,
      ],
      total: { amountMinor: totalMinor, currency },
      deposit: {
        amountMinor:
          policy.mode === "full" ? totalMinor : Math.round(totalMinor * policy.depositPct),
        currency,
      },
      paymentPolicy: policy,
      // Deliberately not hashing the whole response: the uuid rotates on every
      // mutation and would make an unchanged price look like a new one.
      priceSourceHash: stableSourceHash({
        clientPrice: response.clientPrice,
        currency,
        securityDeposit: response.securityDeposit,
        discounts: response.discounts,
        services: response.services,
        additionalEquipment: response.additionalEquipment,
      }),
      expiresAt: response.optionTill
        ? holdExpiresAt(response)
        : // A committed reservation's price stands to the charter itself.
          `${checkIn}T00:00:00.000Z`,
      repriced: true,
    };
    if (response.securityDeposit) {
      quoteInput.securityDeposit = {
        amountMinor: decimalStringToMinor(response.securityDeposit, currency),
        currency,
      };
    }

    return providerQuoteSchema.parse(quoteInput);
  }

  async function logEvent(
    quoteId: string,
    kind: ReservationEventKind,
    step: ReservationStep,
  ): Promise<void> {
    await recordEvent({
      quoteId,
      kind,
      providerReference: String(step.handle.id),
      payload: eventPayload(step),
    });
  }

  /**
   * The extras path knows the reservation but not the quote, so the booking is
   * found the other way round. Kept separate rather than widening the recorder:
   * the quote lookup is the common case and the cheaper one.
   */
  async function logEventForReservation(
    providerReservationId: string,
    kind: ReservationEventKind,
    step: ReservationStep,
  ): Promise<void> {
    const quoteId = await quoteIdForReservation(db, providerReservationId);
    if (!quoteId) return;
    await logEvent(quoteId, kind, step);
  }

  return { createOption, confirmBooking, cancelOption, addOrUpdateExtras };
}

/* ------------------------------------------------------------------ internals */

/** The date in front of a NauSYS date-time. */
function dayOf(value: string): string {
  return value.split(" ")[0] ?? value;
}

function refOf(handle: ReservationHandle): ProviderReservationRef {
  return { providerReservationId: String(handle.id), securityToken: handle.uuid };
}

/**
 * Refuses before the vendor is touched. Both halves are named separately because
 * they fail for different reasons: a missing id means the option step never ran,
 * a missing uuid means a caller dropped the token it was handed.
 */
/**
 * What is on the reservation right now, from the vendor rather than from memory.
 *
 * `listExtras` is a read: it neither rotates the reservation's uuid nor changes anything, so
 * it needs none of the token bookkeeping the mutations go through. It runs on the reservation's
 * own lane all the same, because a read racing the write it is about to inform would answer
 * from before that write.
 *
 * Only services. Removal is keyed by the reservation line id, and `updateExtras` addresses
 * services; the vendor numbers added equipment separately and nothing here removes one yet.
 */
type AvailableExtra = NonNullable<
  z.infer<typeof restListedExtrasSchema>["availableExtras"]
>[number];

/** The reservation's lines and the rows it can still take, from one `listExtras`. */
async function readListedExtras(
  client: NausysClient,
  ref: ProviderReservationRef,
): Promise<{ lines: ReservationExtra[]; available: AvailableExtra[] }> {
  const endpoint = nausysEndpoints.availability.listExtras;
  const handle = requireHandle(ref, endpoint);

  const response = await client.bookingCall(
    endpoint,
    restListedExtrasSchema,
    { id: handle.id, uuid: handle.uuid },
    reservationLane(String(handle.id)),
  );

  const services = (response.addedServices ?? []).map((line) => ({
    yachtReservationServiceId: line.id,
    serviceId: line.serviceId,
    quantity: Number(line.quantityExtras ?? line.quantity ?? "1"),
    pending: line.onPending === true,
    /* Absent means the operator has not locked it; only an explicit false is a lock. */
    editable: line.editable !== false,
    kind: "service" as const,
    obligatory: line.obligatory === true,
    condition: internationalText(line.condition),
  }));
  /* An equipment line that names no equipment cannot be matched to anything, or removed. */
  const equipment = (response.addedEquipment ?? []).flatMap((line) =>
    line.equipmentId === undefined
      ? []
      : [
          {
            yachtReservationServiceId: line.id,
            serviceId: line.equipmentId,
            quantity: Number(line.quantityExtras ?? line.quantity ?? "1"),
            pending: line.onPending === true,
            editable: line.editable !== false,
            kind: "equipment" as const,
            obligatory: line.obligatory === true,
            condition: internationalText(line.condition),
          },
        ],
  );
  return { lines: [...services, ...equipment], available: response.availableExtras ?? [] };
}

/**
 * Says so when the operator put a line we billed on pending: added against a season quantity it
 * has not released, charged only once it is. The customer has paid for it; until the operator
 * releases it, somebody has to know it may not be there at the base.
 */
function reportPendingExtras(quoteId: string, reservation: RestYachtReservation): void {
  const pending = [...(reservation.services ?? []), ...(reservation.additionalEquipment ?? [])]
    .filter((line) => line.onPending === true)
    .map((line) => line.serviceId ?? line.equipmentId);
  if (pending.length === 0) return;

  log.warn({
    action: "nausys.extras_pending",
    quoteId,
    providerReservationId: String(reservation.id),
    pending: pending.join(", "),
  });
}

/** The reservation as the vendor holds it, by id; `reservations` answers for any status. */
async function readReservation(
  client: NausysClient,
  ref: ProviderReservationRef,
): Promise<RestYachtReservation> {
  const endpoint = nausysEndpoints.availability.reservations;
  const handle = requireHandle(ref, endpoint);
  const response = await client.bookingCall(
    endpoint,
    restReservationListSchema,
    { reservations: [handle.id] },
    reservationLane(String(handle.id)),
  );
  const [reservation] = response.reservations ?? [];
  if (!reservation) {
    throw new ContractError(`NauSYS has no reservation ${handle.id}`, { endpoint });
  }
  return reservation;
}

const restReservationListSchema = z.looseObject({
  status: z.string(),
  reservations: z.array(restYachtReservationSchema).optional(),
});

/**
 * Says so when the reservation bills extras at another figure than the quote did.
 *
 * The hold re-prices before opening, but the reservation is the vendor's own calculation, and
 * it has disagreed before: without the party size it priced per-head lines for a full boat.
 * A difference is logged rather than refused, because the option is already held and the
 * customer's quote stands; what the base will ask for at check-in is the part someone has to
 * look at.
 */
function reportExtrasDrift(
  quoteId: string,
  reservation: RestYachtReservation,
  quotedMinor: number | undefined,
): void {
  const currency = reservation.currency ?? reservation.paymentCurrency;
  if (quotedMinor === undefined || !currency || !reservation.clientPrice) return;

  const basis = { clientMinor: decimalStringToMinor(reservation.clientPrice, currency) };
  const heldMinor = [...(reservation.services ?? []), ...(reservation.additionalEquipment ?? [])]
    .filter((line) => line.currency === currency && line.onPending !== true)
    .reduce((sum, line) => sum + extraLineMinor(line, currency, basis), 0);
  if (heldMinor === quotedMinor) return;

  log.warn({
    action: "nausys.hold_extras_drift",
    quoteId,
    providerReservationId: String(reservation.id),
    quotedMinor,
    heldMinor,
    currency,
  });
}

/**
 * The season price rows a set of codes names, among the rows a reservation can still take. A
 * variant code carries its row; a plain code takes its extra's row where there is exactly one.
 */
function rowsForCodes(
  codes: readonly string[],
  available: readonly AvailableExtra[],
): BilledExtraRow[] {
  return codes.flatMap((code) => {
    const parsed = parseExtraCode(code);
    if (parsed === null) return [];
    const candidates = available.filter(
      (row) =>
        row.extraId !== undefined &&
        String(row.extraId) === parsed.externalId &&
        (row.extrasType ?? "").toLowerCase() === parsed.kind &&
        Number.isSafeInteger(row.id),
    );
    const row =
      parsed.variantId === undefined
        ? candidates.length === 1
          ? candidates[0]
          : undefined
        : candidates.find((candidate) => String(candidate.id) === parsed.variantId);
    if (row?.id === undefined) return [];
    return [
      {
        kind: parsed.kind,
        rowId: row.id,
        code,
        externalId: parsed.externalId,
        condition: internationalText(row.condition),
      },
    ];
  });
}

/** `addExtras` by season price row, services and equipment each in their own list. */
function rowAdditions(rows: readonly BilledExtraRow[]): JsonObject {
  const services = rows.filter((row) => row.kind === "service");
  const equipments = rows.filter((row) => row.kind === "equipment");
  return {
    // `quantity: 1` is a formality for a measure-priced extra, not a claim: NauSYS
    // recomputes it from the price measure and answers with its own figure.
    // Verified live 2026-08-20 on a test yacht: a per-person extra added with
    // quantity 1 came back `quantity: "6.00", totalPrice: "60.00"` for a six-person boat.
    ...(services.length === 0
      ? null
      : { services: services.map((row) => ({ serviceId: row.rowId, quantity: 1 })) }),
    ...(equipments.length === 0
      ? null
      : { equipments: equipments.map((row) => ({ equipmentId: row.rowId, quantity: 1 })) }),
  };
}

/** `updateExtras` for reservation lines, each list under the key the vendor gives it. */
function lineUpdates(
  lines: readonly ReservationExtra[],
  quantityOf: (line: ReservationExtra) => number,
): JsonObject {
  const services = lines.filter((line) => (line.kind ?? "service") === "service");
  const equipments = lines.filter((line) => line.kind === "equipment");
  return {
    ...(services.length === 0
      ? null
      : {
          services: services.map((line) => ({
            yachtReservationServiceId: line.yachtReservationServiceId,
            quantity: quantityOf(line),
          })),
        }),
    ...(equipments.length === 0
      ? null
      : {
          equipments: equipments.map((line) => ({
            yachtReservationEquipmentId: line.yachtReservationServiceId,
            quantity: quantityOf(line),
          })),
        }),
  };
}

function requireHandle(ref: ProviderReservationRef, endpoint: string): ReservationHandle {
  const id = Number(ref.providerReservationId);
  if (!ref.providerReservationId || !Number.isInteger(id)) {
    throw new ContractError(
      `NauSYS ${endpoint} needs a numeric reservation id, received ${JSON.stringify(ref.providerReservationId)}`,
      { endpoint },
    );
  }
  if (!ref.securityToken) {
    throw new ContractError(
      `NauSYS ${endpoint} needs the rotating uuid of reservation ${ref.providerReservationId}; none was persisted`,
      { endpoint },
    );
  }
  return { id, uuid: ref.securityToken };
}

function refreshedHandle(response: RestYachtReservation, endpoint: string): ReservationHandle {
  if (!response.uuid) {
    throw new ContractError(`NauSYS ${endpoint} returned no uuid`, {
      endpoint,
      payload: { id: response.id },
    });
  }
  return { id: response.id, uuid: response.uuid };
}

function toCanonicalStatus(status: RestYachtReservation["reservationStatus"]) {
  switch (status) {
    case "RESERVATION":
      return "confirmed";
    case "STORNO":
      return "cancelled";
    default:
      return "option_held";
  }
}

/**
 * `agencyPrice` is our cost, not the customer's, and `client` is PII under §10.
 * The event log is queried freely, so neither is written to it.
 */
function eventPayload(step: ReservationStep) {
  const { response } = step;
  return {
    id: response.id,
    reservationStatus: response.reservationStatus,
    yachtId: response.yachtId,
    periodFrom: response.periodFrom,
    periodTo: response.periodTo,
    optionTill: response.optionTill,
    clientPrice: response.clientPrice,
    currency: response.currency,
    ...(response.approved === undefined ? null : { approved: response.approved }),
  };
}

export interface CustomerName {
  name: string;
  surname: string;
}

/**
 * NauSYS wants a given name and a family name; checkout collects one field. An
 * empty surname is answered with INSUFFICIENT_DATA (201) at the till, so a
 * single-token name is sent in both places rather than half-empty.
 */
export function splitCustomerName(name: string, surname?: string): CustomerName {
  const given = name.trim();
  if (surname?.trim()) {
    return { name: given, surname: surname.trim() };
  }

  const parts = given.split(/\s+/).filter(Boolean);
  if (parts.length < 2) {
    const single = parts[0] ?? "";
    return { name: single, surname: single };
  }
  return { name: parts.slice(0, -1).join(" "), surname: parts.at(-1) ?? "" };
}

/** The site's languages NauSYS names; Ukrainian and Danish are not among its eighteen. */
const NAUSYS_LANGUAGES = new Map([
  ["en", "ENGLISH"],
  ["de", "GERMAN"],
  ["es", "SPANISH"],
  ["fr", "FRENCH"],
  ["it", "ITALIAN"],
  ["pl", "POLISH"],
  ["nl", "DUTCH"],
  ["sv", "SWEDISH"],
  ["no", "NORWEGIAN"],
]);

function toRestClient(customer: BookingDraft["customer"], countryId?: number): RestClient {
  const { name, surname } = splitCustomerName(customer.name, customer.surname);

  /* `company` is documented as obligatory; a company's VAT number only arrives with an invoice
     request, after the hold, so every client we open is a private one. */
  const client: RestClient = { company: false, name, surname, email: customer.email };
  const language = customer.language && NAUSYS_LANGUAGES.get(customer.language.slice(0, 2));
  if (language) client.language = language;
  if (customer.phone) {
    // NauSYS treats the two as separate contact channels; we only ever have one.
    client.phone = customer.phone;
    client.mobile = customer.phone;
  }
  if (customer.address) client.address = customer.address;
  if (customer.zip) client.zip = customer.zip;
  if (customer.city) client.city = customer.city;
  if (countryId !== undefined) client.countryId = countryId;
  return client;
}

type PaymentPolicy = ProviderQuote["paymentPolicy"];

/**
 * The instalment plan lives in `paymentPlans`, which this response does not
 * carry, so an equal split over `numberOfPayments` is the closest honest
 * reading. It is advisory: §6.3 has the listing's own policy override it.
 */
function paymentPolicyOf(response: RestYachtReservation): PaymentPolicy {
  const payments = response.numberOfPayments ?? 1;
  if (payments <= 1) {
    return { mode: "full", depositPct: 1 };
  }
  return { mode: "deposit", depositPct: 1 / payments };
}

async function quoteIdForReservation(
  db: Database,
  providerReservationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ quoteId: booking.quoteId })
    .from(booking)
    .where(
      and(eq(booking.provider, PROVIDER), eq(booking.providerReservationId, providerReservationId)),
    )
    .limit(1);

  return row?.quoteId ?? null;
}

/**
 * Keyed on our own quote, because the booking has no vendor reservation id until this writes
 * one. Both columns together: an id without its uuid is as unreachable as neither.
 */
export function createOpenedReservationSink(db: Database): OpenedReservationSink {
  return async ({ quoteId, providerReservationId, securityToken }) => {
    await db
      .update(booking)
      .set({ providerReservationId, providerReservationUuid: securityToken })
      .where(and(eq(booking.provider, PROVIDER), eq(booking.quoteId, quoteId)));
  };
}

export function createSecurityTokenSink(db: Database): SecurityTokenSink {
  return async ({ providerReservationId, securityToken }) => {
    await db
      .update(booking)
      .set({ providerReservationUuid: securityToken })
      .where(
        and(
          eq(booking.provider, PROVIDER),
          eq(booking.providerReservationId, providerReservationId),
        ),
      );
  };
}
