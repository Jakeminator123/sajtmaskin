import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_KOSTNADSFRI_LOOKUP_URL,
  isKostnadsfriLookupConfigured,
  lookupKostnadsfriProfile,
} from "./profile-lookup";

const SECRET = "lookup-test-secret";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchReturning(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => jsonResponse(status, body));
}

afterEach(() => {
  delete process.env.KOSTNADSFRI_LOOKUP_SECRET;
  delete process.env.KOSTNADSFRI_LOOKUP_URL;
});

describe("lookupKostnadsfriProfile", () => {
  it("är avstängd utan delad nyckel och gör då inget anrop", async () => {
    const fetchImpl = fetchReturning(200, {});
    expect(isKostnadsfriLookupConfigured()).toBe(false);
    expect(await lookupKostnadsfriProfile("zax-2-0-ab", { fetchImpl })).toEqual({
      status: "disabled",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("anropar dashen med x-api-key, no-store och encodad slug", async () => {
    const fetchImpl = fetchReturning(200, {
      slug: "zax-2-0-ab",
      companyName: "Zax 2.0 AB",
      contactEmail: "info@zax.example",
      profile: { city: "Kista", orgNumber: "559599-5639" },
    });

    const result = await lookupKostnadsfriProfile("zax-2-0-ab", { fetchImpl, secret: SECRET });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${DEFAULT_KOSTNADSFRI_LOOKUP_URL}/api/kostnadsfri/lookup?slug=zax-2-0-ab`);
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(SECRET);
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("error");
    expect(result).toEqual({
      status: "hit",
      companyName: "Zax 2.0 AB",
      contactEmail: "info@zax.example",
      profile: { city: "Kista", orgNumber: "559599-5639" },
    });
  });

  it("respekterar KOSTNADSFRI_LOOKUP_URL och tar bort avslutande snedstreck", async () => {
    process.env.KOSTNADSFRI_LOOKUP_SECRET = SECRET;
    process.env.KOSTNADSFRI_LOOKUP_URL = "https://dash.example/";
    const fetchImpl = fetchReturning(404, { error: "not_found" });

    await lookupKostnadsfriProfile("zax-2-0-ab", { fetchImpl });

    expect(fetchImpl.mock.calls[0]![0]).toBe(
      "https://dash.example/api/kostnadsfri/lookup?slug=zax-2-0-ab",
    );
  });

  it("vägrar skicka en slug utanför formen — ingen uppräkning via fallbacken", async () => {
    const fetchImpl = fetchReturning(200, {});
    expect(await lookupKostnadsfriProfile("Zax AB", { fetchImpl, secret: SECRET })).toEqual({
      status: "miss",
    });
    expect(await lookupKostnadsfriProfile("../x", { fetchImpl, secret: SECRET })).toEqual({
      status: "miss",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("litar inte på svaret: personnummer i profilen gör profilen null, inte publicerad", async () => {
    const fetchImpl = fetchReturning(200, {
      companyName: "Zax 2.0 AB",
      contactEmail: null,
      profile: { city: "Kista", businessDescription: "Kontakt 19900516-0172" },
    });

    const result = await lookupKostnadsfriProfile("zax-2-0-ab", { fetchImpl, secret: SECRET });

    expect(result.status).toBe("hit");
    if (result.status === "hit") {
      expect(result.profile).toBeNull();
      expect(JSON.stringify(result)).not.toContain("19900516");
    }
  });

  it("normaliserar om profilen med vår egen allowlist", async () => {
    const fetchImpl = fetchReturning(200, {
      companyName: "Zax 2.0 AB",
      profile: {
        city: "  Kista ",
        orgNumber: "5595995639",
        personer: [{ namn: "X" }],
        aktiekapital: "25.000 SEK",
        registeredAt: "2026-02-31",
      },
    });

    const result = await lookupKostnadsfriProfile("zax-2-0-ab", { fetchImpl, secret: SECRET });

    expect(result).toEqual({
      status: "hit",
      companyName: "Zax 2.0 AB",
      contactEmail: null,
      profile: { city: "Kista", orgNumber: "559599-5639" },
    });
  });

  it("mappar 404, 401 och övriga fel till värden — kastar aldrig", async () => {
    expect(
      await lookupKostnadsfriProfile("zax-2-0-ab", {
        fetchImpl: fetchReturning(404, { error: "not_found" }),
        secret: SECRET,
      }),
    ).toEqual({ status: "miss" });
    expect(
      await lookupKostnadsfriProfile("zax-2-0-ab", {
        fetchImpl: fetchReturning(401, { error: "unauthorized" }),
        secret: SECRET,
      }),
    ).toEqual({ status: "unavailable", reason: "unauthorized" });
    expect(
      await lookupKostnadsfriProfile("zax-2-0-ab", {
        fetchImpl: fetchReturning(503, { error: "lookup_disabled" }),
        secret: SECRET,
      }),
    ).toEqual({ status: "unavailable", reason: "upstream" });
    expect(
      await lookupKostnadsfriProfile("zax-2-0-ab", {
        fetchImpl: vi.fn<typeof fetch>(async () => new Response("not json", { status: 200 })),
        secret: SECRET,
      }),
    ).toEqual({ status: "unavailable", reason: "malformed" });
    expect(
      await lookupKostnadsfriProfile("zax-2-0-ab", {
        fetchImpl: fetchReturning(200, { profile: { city: "Kista" } }),
        secret: SECRET,
      }),
    ).toEqual({ status: "unavailable", reason: "malformed" });
    expect(
      await lookupKostnadsfriProfile("zax-2-0-ab", {
        fetchImpl: vi.fn<typeof fetch>(async () => {
          throw new TypeError("fetch failed");
        }),
        secret: SECRET,
      }),
    ).toEqual({ status: "unavailable", reason: "network" });
  });

  it("släpper efter budgeten när dashen inte svarar (kallstart)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );

    const started = Date.now();
    const result = await lookupKostnadsfriProfile("zax-2-0-ab", {
      fetchImpl,
      secret: SECRET,
      timeoutMs: 30,
    });

    expect(result).toEqual({ status: "unavailable", reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("avbryter när body hänger efter headers — timeout täcker json-läsning", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      return {
        ok: true,
        status: 200,
        json: () =>
          new Promise<unknown>((_resolve, reject) => {
            const abort = () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            };
            if (init?.signal?.aborted) {
              abort();
              return;
            }
            init?.signal?.addEventListener("abort", abort, { once: true });
          }),
      } as Response;
    });

    const started = Date.now();
    const result = await lookupKostnadsfriProfile("zax-2-0-ab", {
      fetchImpl,
      secret: SECRET,
      timeoutMs: 30,
    });

    expect(result).toEqual({ status: "unavailable", reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("rensar timeout efter lyckad snabb body-läsning", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const fetchImpl = fetchReturning(200, {
      companyName: "Zax 2.0 AB",
      profile: { city: "Kista" },
    });

    const result = await lookupKostnadsfriProfile("zax-2-0-ab", {
      fetchImpl,
      secret: SECRET,
      timeoutMs: 5_000,
    });

    expect(result).toEqual({
      status: "hit",
      companyName: "Zax 2.0 AB",
      contactEmail: null,
      profile: { city: "Kista" },
    });
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
