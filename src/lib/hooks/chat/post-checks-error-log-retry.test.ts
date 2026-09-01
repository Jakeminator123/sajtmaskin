import { afterEach, describe, expect, it, vi } from "vitest";

import { persistVersionErrorLogs } from "./post-checks";

/**
 * Spår B: `POST …/error-log` degraderar medvetet till `503 row_contention` +
 * `Retry-After` när verify/lease håller `FOR UPDATE` på versionsraden. Utan
 * retry på klienten blev degraderingen ett tyst tappat kvitto — och för
 * resume-lanen, som tolkar `false` som "blockeraren kunde inte sparas", en
 * fail-closed på en övergående låskonflikt.
 */

const LOGS = [{ level: "error" as const, message: "boom" }];

function response(status: number, retryAfter?: string) {
  return new Response("{}", {
    status,
    headers: retryAfter ? { "Retry-After": retryAfter } : undefined,
  });
}

function persist() {
  return persistVersionErrorLogs({ chatId: "c1", versionId: "v1", logs: LOGS });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("persistVersionErrorLogs — 503-retry", () => {
  it("retryar en 503 och väntar minst så länge Retry-After säger", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(503, "3"))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    const pending = persist();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_500);
    await expect(pending).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ger upp efter det bestämda antalet försök och rapporterar false", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => response(503, "3"));
    vi.stubGlobal("fetch", fetchMock);

    const pending = persist();
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(pending).resolves.toBe(false);
    // Ett första försök + två retries — inte en oändlig kedja.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // En orimlig header får inte hålla resume-lanen (som väntar på svaret) i
  // minuter; taket är hårdkodat i modulen.
  it("lyder inte ett Retry-After längre än taket", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(503, "600"))
      .mockResolvedValueOnce(response(200));
    vi.stubGlobal("fetch", fetchMock);

    const pending = persist();
    await vi.advanceTimersByTimeAsync(5_500);

    await expect(pending).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retryar inte en status som inte ändrar sig av att frågas igen", async () => {
    const fetchMock = vi.fn(async () => response(404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(persist()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("behandlar nätverksfel som best-effort utan retry", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(persist()).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skriver inget alls för en tom logglista", async () => {
    const fetchMock = vi.fn(async () => response(200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      persistVersionErrorLogs({ chatId: "c1", versionId: "v1", logs: [] }),
    ).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bär Product Postchecks exakta revision/lifecycle till den durabla skrivningen", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      persistVersionErrorLogs({
        chatId: "c1",
        versionId: "v1",
        logs: LOGS,
        productPostcheckAttestation: {
          previewSessionId: "ps_legacy",
          lifecycleToken: null,
          filesRevision: "rev_n",
        },
      }),
    ).resolves.toBe(true);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual(
      expect.objectContaining({
        productPostcheckAttestation: {
          previewSessionId: "ps_legacy",
          lifecycleToken: null,
          filesRevision: "rev_n",
        },
      }),
    );
  });
});

/**
 * En Product Postcheck-rad utan sin exakta preview/revision-tupel får aldrig
 * skrivas — men resten av batchen är inte livscykelbunden. Förr föll
 * preflight-, sanity- och bilddiagnostiken med postcheck-raderna, så en körning
 * kunde sakna varje spår i `engine_version_error_logs`.
 */
describe("persistVersionErrorLogs — oattesterbara postcheck-rader", () => {
  const PLAIN_LOG = { level: "warning" as const, message: "preflight" };
  const POSTCHECK_LOG = {
    level: "info" as const,
    category: "product_postcheck.summary",
    message: "PASS",
  };

  it("sparar de icke-livscykelbundna raderna och rapporterar ändå false", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      persistVersionErrorLogs({
        chatId: "c1",
        versionId: "v1",
        logs: [PLAIN_LOG, POSTCHECK_LOG],
      }),
    ).resolves.toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body));
    expect(body.logs).toEqual([PLAIN_LOG]);
    expect(body).not.toHaveProperty("productPostcheckAttestation");
  });

  it("skriver inget när bara postcheck-rader saknar attestering", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(200));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      persistVersionErrorLogs({ chatId: "c1", versionId: "v1", logs: [POSTCHECK_LOG] }),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
