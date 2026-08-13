import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AuthError, ContractError, TransientError } from "./errors";
import {
  buildQueryString,
  createProviderHttpClient,
  type FetchLike,
  httpStatusClassifier,
  type ProviderHttpRequestInit,
} from "./http-client";
import type { JsonValue } from "./json";
import { SequentialQueue } from "./queue";
import { providerRejection } from "../testing/contracts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const json = (status: number, body: JsonValue) => ({
  status,
  text: () => Promise.resolve(JSON.stringify(body)),
});

const noRetry = { maxAttempts: 1 };

const vendorStatusSchema = z.object({ status: z.string() });

describe("createProviderHttpClient", () => {
  it("runs each attempt inside the queue slot and the backoff sleep outside it", async () => {
    const events: string[] = [];
    const entered = deferred();
    const release = deferred();
    let active = 0;
    let peak = 0;
    let aAttempts = 0;

    const fetchImpl: FetchLike = async (url) => {
      const name = url.endsWith("/a") ? "a" : "b";
      active += 1;
      peak = Math.max(peak, active);
      events.push(`fetch:${name}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      if (name === "a") {
        aAttempts += 1;
        if (aAttempts === 1) {
          throw new Error("fetch failed");
        }
      }
      return json(200, { name });
    };

    const client = createProviderHttpClient({
      baseUrl: "https://provider.test",
      queueKey: "one-credential",
      queue: new SequentialQueue(),
      fetchImpl,
      retry: {
        maxAttempts: 3,
        sleep: async () => {
          events.push("sleep");
          entered.resolve();
          await release.promise;
        },
      },
    });

    const a = client.post("/a", {});
    const b = client.post("/b", {});

    await entered.promise;
    // Resolves while the retry is still sleeping: a held lane would deadlock here.
    await expect(b).resolves.toMatchObject({ httpStatus: 200 });
    expect(events).toEqual(["fetch:a", "sleep", "fetch:b"]);

    release.resolve();
    await expect(a).resolves.toMatchObject({ httpStatus: 200 });

    expect(events).toEqual(["fetch:a", "sleep", "fetch:b", "fetch:a"]);
    expect(peak).toBe(1);
  });

  it("wraps a network failure in TransientError so withRetry can see it", async () => {
    const client = createProviderHttpClient({
      baseUrl: "https://provider.test",
      queueKey: "k",
      queue: new SequentialQueue(),
      retry: noRetry,
      fetchImpl: () =>
        Promise.reject(Object.assign(new Error("fetch failed"), { code: "EAI_AGAIN" })),
    });

    const error = await providerRejection(client.post("/x", {}));
    expect(error).toBeInstanceOf(TransientError);
    expect(error.retryable).toBe(true);
  });

  it("retries a transient failure and returns the later success", async () => {
    let attempts = 0;
    const client = createProviderHttpClient({
      baseUrl: "https://provider.test",
      queueKey: "k",
      queue: new SequentialQueue(),
      retry: { maxAttempts: 3, sleep: () => Promise.resolve() },
      fetchImpl: () => {
        attempts += 1;
        if (attempts < 3) {
          return Promise.reject(new Error("socket hang up"));
        }
        return Promise.resolve(json(200, { ok: true }));
      },
    });

    await expect(client.post("/x", {})).resolves.toMatchObject({ body: { ok: true } });
    expect(attempts).toBe(3);
  });

  it("classifies an unparseable body as ContractError", async () => {
    const client = createProviderHttpClient({
      baseUrl: "https://provider.test",
      queueKey: "k",
      queue: new SequentialQueue(),
      retry: noRetry,
      fetchImpl: () =>
        Promise.resolve({ status: 200, text: () => Promise.resolve("<html>503</html>") }),
    });

    const error = await providerRejection(client.post("/x", {}));
    expect(error).toBeInstanceOf(ContractError);
    expect(error.endpoint).toBe("/x");
  });

  it("treats an empty body as null rather than a parse failure", async () => {
    const client = createProviderHttpClient({
      baseUrl: "https://provider.test",
      queueKey: "k",
      queue: new SequentialQueue(),
      retry: noRetry,
      fetchImpl: () => Promise.resolve({ status: 200, text: () => Promise.resolve("") }),
    });

    await expect(client.post("/x", {})).resolves.toMatchObject({ body: null });
  });

  it("turns a timeout into TransientError", async () => {
    const client = createProviderHttpClient({
      baseUrl: "https://provider.test",
      queueKey: "k",
      timeoutMs: 5,
      queue: new SequentialQueue(),
      retry: noRetry,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => {
            reject(init.signal.reason);
          });
        }),
    });

    await expect(client.post("/slow", {})).rejects.toBeInstanceOf(TransientError);
  });

  it("hands the untouched body to onRawResponse before classifying it", async () => {
    const seen: unknown[] = [];
    const client = createProviderHttpClient({
      baseUrl: "https://provider.test",
      queueKey: "k",
      queue: new SequentialQueue(),
      retry: noRetry,
      fetchImpl: () =>
        Promise.resolve(json(200, { status: "AUTHENTICATION_ERROR", errorCode: 100 })),
      classifyResponse: (_httpStatus, body) =>
        vendorStatusSchema.safeParse(body).data?.status === "OK" ? null : new AuthError("rejected"),
      onRawResponse: (event) => {
        seen.push(event.body);
      },
    });

    await expect(client.post("/x", {})).rejects.toBeInstanceOf(AuthError);
    // Retained even though the call failed: an error body is the evidence.
    expect(seen).toEqual([{ status: "AUTHENTICATION_ERROR", errorCode: 100 }]);
  });

  it("posts JSON to the joined URL", async () => {
    const captured: { url: string; body: string | undefined; method: string }[] = [];
    const client = createProviderHttpClient({
      baseUrl: "https://provider.test/",
      queueKey: "k",
      queue: new SequentialQueue(),
      retry: noRetry,
      fetchImpl: (url, init) => {
        captured.push({ url, body: init.body, method: init.method });
        return Promise.resolve(json(200, {}));
      },
    });

    await client.post("/rest/v6/countries", { page: 1 });

    expect(captured).toEqual([
      {
        url: "https://provider.test/rest/v6/countries",
        body: JSON.stringify({ page: 1 }),
        method: "POST",
      },
    ]);
  });

  function captureRequests() {
    const captured: (ProviderHttpRequestInit & { url: string })[] = [];
    const client = createProviderHttpClient({
      baseUrl: "https://provider.test/",
      queueKey: "k",
      queue: new SequentialQueue(),
      retry: noRetry,
      headers: { authorization: "Bearer t0ken" },
      fetchImpl: (url, init) => {
        captured.push({ url, ...init });
        return Promise.resolve(json(200, {}));
      },
    });
    return { captured, client };
  }

  it("sends a GET with no body and no content-type", async () => {
    const { captured, client } = captureRequests();

    await client.get("yachts");

    expect(captured[0]?.method).toBe("GET");
    expect(captured[0]?.url).toBe("https://provider.test/yachts");
    // A content-type on a bodyless GET invites a 415 from hosts that validate it.
    expect(captured[0]?.body).toBeUndefined();
    expect(captured[0]?.headers["content-type"]).toBeUndefined();
    expect(captured[0]?.headers.authorization).toBe("Bearer t0ken");
  });

  it("appends query parameters and repeats a key per array element", async () => {
    const { captured, client } = captureRequests();

    await client.get("offers", {
      dateFrom: "2026-08-08T00:00:00",
      yachtId: [1, 2],
      showOptions: true,
    });

    expect(captured[0]?.url).toBe(
      "https://provider.test/offers?dateFrom=2026-08-08T00%3A00%3A00&yachtId=1&yachtId=2&showOptions=true",
    );
  });

  it("omits undefined query parameters rather than sending the string", async () => {
    const { captured, client } = captureRequests();

    await client.get("prices", { currency: undefined, yachtId: 7 });

    expect(captured[0]?.url).toBe("https://provider.test/prices?yachtId=7");
  });

  it("sends DELETE and bodyless PUT without a body", async () => {
    const { captured, client } = captureRequests();

    await client.del("reservation/5");
    await client.put("reservation/5");

    expect(captured.map((c) => [c.method, c.body])).toEqual([
      ["DELETE", undefined],
      ["PUT", undefined],
    ]);
  });

  it("classifies a GET failure through the same taxonomy as a POST", async () => {
    const client = createProviderHttpClient({
      baseUrl: "https://provider.test",
      queueKey: "k",
      queue: new SequentialQueue(),
      retry: noRetry,
      fetchImpl: () => Promise.resolve(json(401, { message: "nope" })),
    });

    await expect(client.get("yachts")).rejects.toBeInstanceOf(AuthError);
  });

  it("retains the raw body of a GET before classification", async () => {
    const seen: unknown[] = [];
    const client = createProviderHttpClient({
      baseUrl: "https://provider.test",
      queueKey: "k",
      queue: new SequentialQueue(),
      retry: noRetry,
      onRawResponse: (event) => {
        seen.push(event.body);
      },
      fetchImpl: () => Promise.resolve(json(404, { message: "gone" })),
    });

    await expect(client.get("yacht/1")).rejects.toBeInstanceOf(Error);

    // A retained error body is exactly what makes a vendor dispute arguable.
    expect(seen).toEqual([{ message: "gone" }]);
  });
});

describe("buildQueryString", () => {
  it("returns an empty string when nothing is set", () => {
    expect(buildQueryString({})).toBe("");
    expect(buildQueryString({ a: undefined })).toBe("");
  });

  it("skips an empty array rather than emitting a bare key", () => {
    expect(buildQueryString({ yachtId: [] })).toBe("");
  });

  it("percent-encodes reserved characters", () => {
    expect(buildQueryString({ dateFrom: "2026-08-08T00:00:00" })).toBe(
      "?dateFrom=2026-08-08T00%3A00%3A00",
    );
  });
});

describe("httpStatusClassifier", () => {
  const context = { endpoint: "/x" };

  it("passes 2xx through", () => {
    expect(httpStatusClassifier(200, {}, context)).toBeNull();
  });

  it("maps status families to the error taxonomy", () => {
    expect(httpStatusClassifier(401, {}, context)).toBeInstanceOf(AuthError);
    expect(httpStatusClassifier(404, {}, context)?.errorType).toBe("not_found");
    expect(httpStatusClassifier(429, {}, context)?.errorType).toBe("rate_limited");
    expect(httpStatusClassifier(502, {}, context)).toBeInstanceOf(TransientError);
    expect(httpStatusClassifier(422, {}, context)).toBeInstanceOf(ContractError);
  });
});
