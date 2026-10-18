import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DID_STREAM_RELEASE_BACKOFF_MS,
  DID_STREAM_RELEASE_TIMEOUT_MS,
  appendPendingRelease,
  releaseDidStream,
  settleWithinReleaseTimeout,
  type DidStreamIdentity,
} from "./did-stream-release";

const STREAM: DidStreamIdentity = {
  streamId: "strm_abc",
  sessionId: "sess_xyz",
  agentId: "v2_agt_test",
};

const COOKIE_SESSION_ID =
  "AWSALB=abc+def/ghi==; Expires=Thu, 01 Jan 2026 00:00:00 GMT; Path=/; SameSite=None";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("releaseDidStream", () => {
  it("sends the session id unchanged in the JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const stream = { ...STREAM, sessionId: COOKIE_SESSION_ID };

    const outcome = await releaseDidStream(stream, "client-key", { retry: false });

    expect(outcome).toEqual({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.d-id.com/agents/v2_agt_test/streams/strm_abc");
    expect(url).not.toContain("session_id");
    expect(url).not.toContain("abc%2B");
    expect(init.method).toBe("DELETE");
    expect(init.keepalive).toBe(true);
    expect(init.headers).toMatchObject({
      Authorization: "Client-Key client-key",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init.body))).toEqual({ session_id: COOKIE_SESSION_ID });
    expect(String(init.body)).toContain("abc+def/ghi==");
    expect(String(init.body)).not.toContain("abc%2Bdef");
  });

  it("retries a 503 and then returns ok", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = releaseDidStream(STREAM, "client-key");
    await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_BACKOFF_MS);

    await expect(pending).resolves.toEqual({ ok: true, status: 200 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 400", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = releaseDidStream(STREAM, "client-key");
    await expect(pending).resolves.toEqual({ ok: false, status: 400 });
    await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a network error until the deadline and then stops", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);

    const pending = releaseDidStream(STREAM, "client-key");
    const seen = pending.then((outcome) => outcome);
    await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS);

    await expect(seen).resolves.toEqual({ ok: false, reason: "network" });
    const calls = fetchMock.mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("aborts a stalled request at the deadline so a reconnect is not blocked", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = releaseDidStream(STREAM, "client-key");
    const seen = pending.then((outcome) => outcome);
    await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS + 1);

    await expect(seen).resolves.toEqual({ ok: false, reason: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up on repeated 503 responses when the deadline passes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const pending = releaseDidStream(STREAM, "client-key");
    const seen = pending.then((outcome) => outcome);
    await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS);

    await expect(seen).resolves.toEqual({ ok: false, status: 503 });
    const calls = fetchMock.mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS);
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("does not retry when pagehide asks for a single attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(releaseDidStream(STREAM, "client-key", { retry: false })).resolves.toEqual({
      ok: false,
      status: 503,
    });
    await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("settles a hanging pagehide attempt at the deadline without aborting keepalive", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, _init?: RequestInit) => new Promise<Response>(() => {}),
    );
    vi.stubGlobal("fetch", fetchMock);

    const pending = releaseDidStream(STREAM, "client-key", { retry: false });
    const seen = pending.then((outcome) => outcome);
    await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS);

    await expect(seen).resolves.toEqual({ ok: false, reason: "network" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.keepalive).toBe(true);
    expect(init?.signal).toBeUndefined();
  });
});

describe("appendPendingRelease", () => {
  it("does not let a release that never settles block the queue past the deadline", async () => {
    vi.useFakeTimers();
    const pendingRef = { current: Promise.resolve() };
    let settled = false;
    const queued = appendPendingRelease(pendingRef, new Promise(() => {}));
    const seen = queued.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await seen;
    expect(settled).toBe(true);
    await expect(pendingRef.current).resolves.toBeUndefined();
  });
});

describe("settleWithinReleaseTimeout", () => {
  it("resolves a promise that never settles at the release deadline", async () => {
    vi.useFakeTimers();
    let settled = false;
    const seen = settleWithinReleaseTimeout(new Promise(() => {})).then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(DID_STREAM_RELEASE_TIMEOUT_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await seen;
    expect(settled).toBe(true);
  });

  it("swallows a rejection instead of breaking the queue", async () => {
    await expect(settleWithinReleaseTimeout(Promise.reject(new Error("boom")))).resolves.toBeUndefined();
  });
});
