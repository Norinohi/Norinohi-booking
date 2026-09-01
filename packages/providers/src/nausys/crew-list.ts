import { z } from "zod";

import { ProviderError } from "../shared/errors";
import type { JsonObject } from "../shared/json";
import type { CrewListMember, CrewListReceipt, CrewPlace } from "../types";
import type { NausysClient } from "./client";
import { nausysEndpoints, restCountriesResponseSchema } from "./endpoints";

/**
 * What the fleet operator insists on knowing about the people aboard.
 *
 * Every operator asks for a different crew list, and the vendor states which per reservation:
 * `requiredFields` is documented as "fields required by the Fleet operator for a complete crew
 * list on this particular reservation/booking". We were not reading it, so our own form asked
 * for the same four things everywhere and the customer discovered the rest — a birth place, a
 * document type, a skipper's licence — only on the operator's own page, if at all.
 *
 * Read rather than submitted. NauSYS sanctioned forwarding its hosted crew-list page instead of
 * posting passenger data through `crewlist/v6/set2` (see `crewListLinkOf`), so this endpoint is
 * used for what it can tell us about the ask, never to answer it.
 */
export interface NausysCrewRequirements {
  /** Vendor field names, verbatim: `birthDate`, `documentNumber`, `nationality`, and so on. */
  requiredFields: string[];
  /** How many people this reservation's list may hold; null where the vendor omits it. */
  maxPassengers: number | null;
  /** Whether the operator expects one of them to be named as the skipper. */
  skipperRequired: boolean | null;
}

/* Loose like the vendor's other structures: it adds fields between minor releases. */
const restCrewListSchema = z.looseObject({
  reservationId: z.number().int().optional(),
  maxPassengers: z.number().int().optional(),
  insertSkipper: z.boolean().optional(),
  requiredFields: z.array(z.string()).optional(),
});

/**
 * `securityCode` in the URL is the reservation's own `uuid`, which is why this needs no
 * credentials: the token is the authorisation, and the vendor rotates it on every write.
 */
export function crewListPath(reservationId: string, securityCode: string): string {
  return `/CBMS-external/rest/crewlist/v6/get/${encodeURIComponent(reservationId)}/${encodeURIComponent(securityCode)}`;
}

export async function fetchNausysCrewRequirements(
  client: NausysClient,
  reservationId: string,
  securityCode: string,
): Promise<NausysCrewRequirements> {
  const list = await client.getJson(crewListPath(reservationId, securityCode), restCrewListSchema);

  return {
    requiredFields: list.requiredFields ?? [],
    maxPassengers: list.maxPassengers ?? null,
    skipperRequired: list.insertSkipper ?? null,
  };
}

/**
 * The exact request `set2` would receive, without sending it.
 *
 * Exported so a probe can show what we would file against a real reservation -- the dates and
 * country codes converted, the licence fields placed -- on an account where every reservation
 * belongs to a real charter company and none may be written to.
 */
export async function nausysCrewListBody(
  client: NausysClient,
  members: readonly CrewListMember[],
  note?: string,
): Promise<JsonObject> {
  const alpha3 = await nausysAlpha3Codes(client);
  return {
    passengers: members.map((member) => passengerOf(member, alpha3)),
    ...(note === undefined ? null : { crewListNote: note }),
  };
}

/**
 * Where the list is filed. Same pair of path segments as the read, and the same reason for
 * them: the token in the URL is the authorisation, so this write carries no credentials.
 *
 * `set2` rather than `set`. The two take the same body; only `set2` answers a rejection with
 * the period it could not cover, which is the difference between telling a customer what to
 * fix and telling them it did not work.
 */
export function crewListSetPath(reservationId: string, securityCode: string): string {
  return `/CBMS-external/rest/crewlist/v6/set2/${encodeURIComponent(reservationId)}/${encodeURIComponent(securityCode)}`;
}

/**
 * The vendor answers a rejected list with the charter days it does not cover, so a rejection
 * is data rather than a failure. Loose because `set2` returns the whole crew list back on the
 * validation path and a bare status on the happy one.
 */
const restCrewListSetResponseSchema = z.looseObject({
  status: z.string().optional(),
  errorCode: z.number().int().optional(),
  invalidPeriodFrom: z.string().optional(),
  invalidPeriodTo: z.string().optional(),
});

/** The two answers that are the operator's decision rather than our mistake. */
const REFUSALS = new Set(["CREW_LIST_VALIDATION_FAILED", "CREW_LIST_LOCKED"]);

export async function submitNausysCrewList(
  client: NausysClient,
  reservationId: string,
  securityCode: string,
  members: readonly CrewListMember[],
  note?: string,
): Promise<CrewListReceipt> {
  const body = await nausysCrewListBody(client, members, note);

  try {
    const answer = await client.postJson(
      crewListSetPath(reservationId, securityCode),
      body,
      restCrewListSetResponseSchema,
    );
    return { accepted: true, ...(answer.status ? { providerCode: answer.status } : null) };
  } catch (error) {
    if (error instanceof ProviderError) {
      const refusal = refusalOf(error);
      if (refusal) return refusal;
    }
    throw error;
  }
}

/**
 * A refused list, read back off the error the transport raised for it.
 *
 * The HTTP layer classifies every non-OK NauSYS status as an error, which is right for the
 * rest of the API and wrong here: an operator saying the list does not cover the charter, or
 * that it has closed the list, has answered us. Anything else -- a bad token, a timeout, a
 * status we do not know -- keeps throwing, because the customer's list did not reach anyone.
 */
function refusalOf(error: ProviderError): CrewListReceipt | null {
  const code = error.providerCode;
  if (code === undefined || !REFUSALS.has(code)) return null;

  const receipt: CrewListReceipt = { accepted: false, providerCode: code, message: error.message };

  /* The refused body is the error's payload; the days it names are the whole point of set2. */
  const answer = restCrewListSetResponseSchema.safeParse(error.payload);
  if (!answer.success) return receipt;

  const { invalidPeriodFrom, invalidPeriodTo } = answer.data;
  if (!invalidPeriodFrom || !invalidPeriodTo) return receipt;

  return {
    ...receipt,
    invalidPeriod: { from: isoDateOf(invalidPeriodFrom), to: isoDateOf(invalidPeriodTo) },
  };
}

/**
 * One passenger in the vendor's own vocabulary: `dd.MM.yyyy` dates, alpha-3 countries, and
 * the skipper's licence fields only on the person who is the skipper.
 *
 * Empty strings are dropped rather than sent. The vendor performs no validation on this call,
 * so a blank it accepts is a blank the operator reads as answered, and the base stops asking
 * for something nobody supplied.
 */
function passengerOf(member: CrewListMember, alpha3: ReadonlyMap<string, string>): JsonObject {
  const passenger: JsonObject = {
    skipper: member.skipper,
    name: member.firstName,
    surname: member.lastName,
  };

  const optional = {
    birthDate: nausysDateOf(member.dateOfBirth),
    birthPlace: member.birthPlace,
    birthCountry: alpha3Of(member.birthCountry, alpha3),
    nationality: alpha3Of(member.nationality, alpha3),
    documentType: member.documentType,
    documentNumber: member.documentNumber,
    gender: member.gender,
    livingPlace: member.livingPlace,
    livingCountry: alpha3Of(member.livingCountry, alpha3),
    embarkmentDate: nausysDateOf(member.embarkDate),
    disembarkmentDate: nausysDateOf(member.disembarkDate),
    ...(member.skipper
      ? {
          skipperLicence: member.skipperLicence,
          vhfLicence: member.vhfLicence,
          skipperEmail: member.skipperEmail,
          skipperMobile: member.skipperMobile,
        }
      : null),
  };

  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined && value !== "") passenger[key] = value;
  }

  return passenger;
}

/** `yyyy-mm-dd` in, `dd.MM.yyyy` out; anything else is left out of the list entirely. */
function nausysDateOf(iso: string | undefined): string | undefined {
  if (iso === undefined) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return undefined;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function isoDateOf(nausys: string): string {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(nausys);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : nausys;
}

/**
 * Alpha-2 is what every country field in this codebase carries; the crew list is the one
 * place that wants alpha-3, and the vendor's own catalogue is what maps between them --
 * `code` is the three-letter form, `code2` the two. Unmapped codes are dropped rather than
 * guessed: an operator with no country beats one with the wrong country.
 */
function alpha3Of(
  alpha2: string | undefined,
  codes: ReadonlyMap<string, string>,
): string | undefined {
  if (alpha2 === undefined) return undefined;
  return codes.get(alpha2.toUpperCase());
}

/**
 * The vendor's country table, fetched once per client and kept.
 *
 * It is a static list of 250 rows behind a credentialed call, so refetching it per crew list
 * would put a catalogue call in front of a customer pressing Save.
 */
const alpha3ByClient = new WeakMap<NausysClient, Promise<ReadonlyMap<string, string>>>();

function nausysAlpha3Codes(client: NausysClient): Promise<ReadonlyMap<string, string>> {
  const cached = alpha3ByClient.get(client);
  if (cached) return cached;

  const loading = loadAlpha3Codes(client);
  alpha3ByClient.set(client, loading);
  return loading;
}

async function loadAlpha3Codes(client: NausysClient): Promise<ReadonlyMap<string, string>> {
  try {
    const response = await client.catalogueCall(
      nausysEndpoints.catalogue.countries,
      restCountriesResponseSchema,
    );

    const codes = new Map<string, string>();
    for (const country of response.countries ?? []) {
      if (country.code && country.code2) codes.set(country.code2.toUpperCase(), country.code);
    }
    return codes;
  } catch (failure) {
    // Not kept: a catalogue that was down once should be asked again on the next crew list.
    alpha3ByClient.delete(client);
    throw failure;
  }
}

/*
 * The places the operator's crew list will accept for a Croatian birth or residence.
 *
 * Not a nicety: the specification says a place of birth in Croatia "must be one from the list
 * of known places in Croatia", and the API validates nothing, so a free-typed "Split" that
 * does not match is accepted by the wire and rejected by the desk. `key` is the "Place name"
 * column the crew list wants; `value` names the municipality it sits in, which is how a
 * customer tells two places of the same name apart.
 */
const restPlacesSchema = z.looseObject({
  places: z.array(z.looseObject({ key: z.string(), value: z.string().optional() })).optional(),
});

/**
 * 6,851 rows and 360 KB, unchanging: fetched once per process and searched in memory rather
 * than shipped to the browser or asked for per keystroke.
 */
let croatianPlaces: Promise<readonly CrewPlace[]> | undefined;

export function nausysCrewPlaces(client: NausysClient): Promise<readonly CrewPlace[]> {
  croatianPlaces ??= loadCrewPlaces(client);
  return croatianPlaces;
}

async function loadCrewPlaces(client: NausysClient): Promise<readonly CrewPlace[]> {
  try {
    const answer = await client.getJson("/CBMS-external/rest/crewlist/places", restPlacesSchema);
    return (answer.places ?? []).map((place) => ({
      name: place.key,
      label: place.value ?? place.key,
    }));
  } catch (failure) {
    // Asked again next time: an empty list would silently become "there are no such places".
    croatianPlaces = undefined;
    throw failure;
  }
}

/**
 * Matches on both halves, because a customer types either: "Split" finds the town, and
 * "Dicmo" finds the eleven hamlets filed under it. Prefix matches first -- someone typing
 * "Zagreb" wants Zagreb, not "Donji Zagreb" -- then the rest, alphabetically.
 */
export async function searchNausysCrewPlaces(
  client: NausysClient,
  query: string,
  limit: number,
): Promise<CrewPlace[]> {
  const needle = query.trim().toLocaleLowerCase("hr");
  const places = await nausysCrewPlaces(client);
  if (needle.length === 0) return places.slice(0, limit);

  const prefix: CrewPlace[] = [];
  const anywhere: CrewPlace[] = [];
  for (const place of places) {
    const name = place.name.toLocaleLowerCase("hr");
    if (name.startsWith(needle)) prefix.push(place);
    else if (name.includes(needle) || place.label.toLocaleLowerCase("hr").includes(needle)) {
      anywhere.push(place);
    }
    if (prefix.length >= limit) break;
  }

  return [...prefix, ...anywhere].slice(0, limit);
}
