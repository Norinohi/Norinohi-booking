import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

import { ContractError, ProviderError } from "../shared/errors";
import type { JsonObject } from "../shared/json";
import type { CrewListMember } from "../types";
import type { NausysClient } from "./client";
import {
  crewListPath,
  crewListSetPath,
  fetchNausysCrewRequirements,
  searchNausysCrewPlaces,
  submitNausysCrewList,
} from "./crew-list";

/** The shapes the vendor's crew list actually takes, which is all this stub ever returns. */
type CrewListBody = {
  reservationId?: number;
  maxPassengers?: number;
  insertSkipper?: boolean;
  requiredFields?: string[];
};

function clientReturning(body: CrewListBody) {
  const asked: string[] = [];
  // SAFETY: a stub with nothing behind it; any method this path does not use is absent, so
  // reaching for one is a TypeError rather than a wrong answer.
  const client = Object.assign({} as NausysClient, {
    /* The real schema runs here, so a stub cannot answer with a shape the vendor could not send. */
    getJson: <TOut>(path: string, schema: z.ZodType<TOut>) => {
      asked.push(path);
      return Promise.resolve(schema.parse(body));
    },
  });
  return { client, asked };
}

describe("crew-list requirements", () => {
  it("authorises with the reservation's own rotating token, in the path", () => {
    expect(crewListPath("898654497", "6d1bc4d4-5fd8")).toBe(
      "/CBMS-external/rest/crewlist/v6/get/898654497/6d1bc4d4-5fd8",
    );
  });

  it("reads what this operator requires of the people aboard", async () => {
    const { client } = clientReturning({
      reservationId: 898654497,
      maxPassengers: 10,
      insertSkipper: true,
      requiredFields: ["birthDate", "birthPlace", "documentType", "documentNumber"],
    });

    await expect(fetchNausysCrewRequirements(client, "898654497", "token")).resolves.toEqual({
      requiredFields: ["birthDate", "birthPlace", "documentType", "documentNumber"],
      maxPassengers: 10,
      skipperRequired: true,
    });
  });

  /* An operator that lists nothing is asking for nothing; that is an answer, not a gap. */
  it("reads an absent list as no requirements rather than as unknown", async () => {
    const { client } = clientReturning({ reservationId: 1 });

    await expect(fetchNausysCrewRequirements(client, "1", "token")).resolves.toEqual({
      requiredFields: [],
      maxPassengers: null,
      skipperRequired: null,
    });
  });

  it("keeps the vendor's own field names, which is what a form can match on", async () => {
    const { client } = clientReturning({ requiredFields: ["vhfLicence", "skipperLicence"] });
    const requirements = await fetchNausysCrewRequirements(client, "1", "token");

    expect(requirements.requiredFields).toEqual(["vhfLicence", "skipperLicence"]);
  });
});

/** Two of the vendor's 250 countries, which is all a crew list needs to map. */
const COUNTRIES = {
  status: "OK",
  countries: [
    { id: 1, code: "AUT", code2: "AT", name: { textEN: "Austria" } },
    { id: 2, code: "GBR", code2: "GB", name: { textEN: "United Kingdom" } },
  ],
};

const GUEST: CrewListMember = {
  firstName: "Mark",
  lastName: "Dower",
  skipper: false,
  dateOfBirth: "1964-02-18",
  birthPlace: "Salzburg",
  birthCountry: "AT",
  nationality: "AT",
  documentType: "PASSPORT",
  documentNumber: "P1234567890",
  gender: "MALE",
  /* Carried by a guest, and dropped: only the skipper's row has a place for them. */
  skipperLicence: "S-005613",
  vhfLicence: "",
};

const SKIPPER: CrewListMember = {
  firstName: "Ana",
  lastName: "Marić",
  skipper: true,
  nationality: "GB",
  skipperLicence: "RYA-102938",
  skipperEmail: "ana@example.com",
  vhfLicence: "",
};

/** A client that answers the country catalogue and records what was posted where. */
function submittingClient(answer: { status: string } | ProviderError) {
  const posted: { path: string; body: JsonObject }[] = [];
  // SAFETY: a stub with nothing behind it; a path this test does not exercise is absent, so
  // reaching for one is a TypeError rather than a wrong answer.
  const client = Object.assign({} as NausysClient, {
    catalogueCall: <TOut>(_endpoint: string, schema: z.ZodType<TOut>) =>
      Promise.resolve(schema.parse(COUNTRIES)),
    postJson: <TOut>(path: string, body: JsonObject, schema: z.ZodType<TOut>) => {
      posted.push({ path, body });
      if (answer instanceof ProviderError) return Promise.reject(answer);
      return Promise.resolve(schema.parse(answer));
    },
  });
  return { client, posted };
}

function passengersOf(body: JsonObject) {
  const { passengers } = z
    .object({ passengers: z.array(z.record(z.string(), z.unknown())) })
    .parse(body);
  return passengers;
}

describe("submitting a crew list", () => {
  it("posts to the reservation's own set2 path", async () => {
    const { client, posted } = submittingClient({ status: "OK" });

    const receipt = await submitNausysCrewList(client, "3618721", "9a4c52", [GUEST]);

    expect(receipt.accepted).toBe(true);
    expect(posted[0]?.path).toBe(crewListSetPath("3618721", "9a4c52"));
  });

  it("speaks the vendor's dialect: dd.MM.yyyy dates and alpha-3 countries", async () => {
    const { client, posted } = submittingClient({ status: "OK" });

    await submitNausysCrewList(client, "1", "token", [GUEST]);

    expect(passengersOf(posted[0]?.body ?? {})[0]).toMatchObject({
      name: "Mark",
      surname: "Dower",
      birthDate: "18.02.1964",
      birthCountry: "AUT",
      nationality: "AUT",
    });
  });

  /* A blank the operator accepts is a blank it reads as answered, and stops asking about. */
  it("leaves out what nobody filled in", async () => {
    const { client, posted } = submittingClient({ status: "OK" });

    await submitNausysCrewList(client, "1", "token", [SKIPPER]);

    const [skipper] = passengersOf(posted[0]?.body ?? {});
    expect(skipper).not.toHaveProperty("vhfLicence");
    expect(skipper).not.toHaveProperty("birthDate");
  });

  it("gives the licence fields only to the person sailing the boat", async () => {
    const { client, posted } = submittingClient({ status: "OK" });

    await submitNausysCrewList(client, "1", "token", [GUEST, SKIPPER]);

    const [guest, skipper] = passengersOf(posted[0]?.body ?? {});
    expect(guest).not.toHaveProperty("skipperLicence");
    expect(skipper).toMatchObject({ skipper: true, skipperLicence: "RYA-102938" });
  });

  it("sends a country it cannot map as no country at all", async () => {
    const { client, posted } = submittingClient({ status: "OK" });

    await submitNausysCrewList(client, "1", "token", [{ ...GUEST, nationality: "ZZ" }]);

    expect(passengersOf(posted[0]?.body ?? {})[0]).not.toHaveProperty("nationality");
  });

  it("carries the note the base reads on arrival", async () => {
    const { client, posted } = submittingClient({ status: "OK" });

    await submitNausysCrewList(client, "1", "token", [GUEST], "Landing at 23:40");

    expect(posted[0]?.body.crewListNote).toBe("Landing at 23:40");
  });

  /*
   * The operator refusing is an answer, not our failure: it names the charter days the list
   * does not cover, and the customer can fix exactly that.
   */
  it("reads a refused list as a receipt, with the days it names", async () => {
    const { client } = submittingClient(
      new ContractError("NauSYS crew list failed with CREW_LIST_VALIDATION_FAILED", {
        providerCode: "CREW_LIST_VALIDATION_FAILED",
        payload: {
          status: "ERROR",
          invalidPeriodFrom: "08.11.2025",
          invalidPeriodTo: "15.11.2025",
        },
      }),
    );

    await expect(submitNausysCrewList(client, "1", "token", [GUEST])).resolves.toEqual({
      accepted: false,
      providerCode: "CREW_LIST_VALIDATION_FAILED",
      message: "NauSYS crew list failed with CREW_LIST_VALIDATION_FAILED",
      invalidPeriod: { from: "2025-11-08", to: "2025-11-15" },
    });
  });

  it("reads a locked list as a refusal too, with nothing to fix", async () => {
    const { client } = submittingClient(
      new ContractError("locked", { providerCode: "CREW_LIST_LOCKED" }),
    );

    const receipt = await submitNausysCrewList(client, "1", "token", [GUEST]);
    expect(receipt).toMatchObject({ accepted: false, providerCode: "CREW_LIST_LOCKED" });
    expect(receipt.invalidPeriod).toBeUndefined();
  });

  /* Anything else means the list reached nobody, and saying "sent" would be a lie. */
  it("keeps throwing when the list did not reach the operator", async () => {
    const { client } = submittingClient(
      new ContractError("bad token", { providerCode: "AUTHENTICATION_ERROR" }),
    );

    await expect(submitNausysCrewList(client, "1", "token", [GUEST])).rejects.toBeInstanceOf(
      ProviderError,
    );
  });
});

/*
 * The vendor will not take a Croatian place typed freehand, and validates none of them on the
 * way in, so the customer has to be shown the operator's own spelling. The list is fetched once
 * and searched here; these fix what "matching" means.
 */
describe("the places a Croatian crew list accepts", () => {
  const PLACES = {
    places: [
      { key: "Split", value: "Split" },
      { key: "Splitska", value: "Postira - Splitska" },
      { key: "Donji Split", value: "Nekakvo Mjesto - Donji Split" },
      { key: "Krušvar", value: "Dicmo - Dicmo Krušvar" },
    ],
  };

  // SAFETY: one stub for the whole group, since the loader caches per process and the first
  // call fixes the list; nothing on this path reaches for a method the stub does not carry.
  const client = Object.assign({} as NausysClient, {
    getJson: <TOut>(_path: string, schema: z.ZodType<TOut>) =>
      Promise.resolve(schema.parse(PLACES)),
  });

  it("puts what the customer started typing first", async () => {
    const found = await searchNausysCrewPlaces(client, "split", 10);

    expect(found.map((place) => place.name)).toEqual(["Split", "Splitska", "Donji Split"]);
  });

  /* Dozens of these names repeat, and the municipality is the only thing that separates them. */
  it("finds a hamlet by the town it is filed under", async () => {
    const found = await searchNausysCrewPlaces(client, "dicmo", 10);

    expect(found).toEqual([{ name: "Krušvar", label: "Dicmo - Dicmo Krušvar" }]);
  });

  it("names the municipality, which is what tells two Splits apart", async () => {
    const [first] = await searchNausysCrewPlaces(client, "splitska", 10);

    expect(first?.label).toBe("Postira - Splitska");
  });

  it("answers nothing for a place the operator does not know", async () => {
    await expect(searchNausysCrewPlaces(client, "Salzburg", 10)).resolves.toEqual([]);
  });
});
