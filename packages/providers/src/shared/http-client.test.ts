import { describe, expect, it } from "vitest";

import { AuthError, ContractError, TransientError } from "./errors";
import { createProviderHttpClient, type FetchLike, httpStatusClassifier } from "./http-client";
import { SequentialQueue } from "./queue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const json = (status: number, body: unknown) => ({
  status,
  text: () => Promise.resolve(JSON.stringify(body)),
});

const noRetry = { maxAttempts: 1 };

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

    const error = await client.post("/x", {}).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(TransientError);
    expect((error as TransientError).retryable).toBe(true);
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

    const error = await client.post("/x", {}).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ContractError);
    expect((error as ContractError).endpoint).toBe("/x");
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
        (body as { status: string }).status === "OK" ? null : new AuthError("rejected"),
      onRawResponse: (event) => {
        seen.push(event.body);
      },
    });

    await expect(client.post("/x", {})).rejects.toBeInstanceOf(AuthError);
    // Retained even though the call failed: an error body is the evidence.
    expect(seen).toEqual([{ status: "AUTHENTICATION_ERROR", errorCode: 100 }]);
  });

  it("posts JSON to the joined URL", async () => {
    const captured: { url: string; body: string; method: string }[] = [];
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
