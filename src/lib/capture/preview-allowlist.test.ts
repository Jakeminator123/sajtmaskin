/**
 * Allowlisten är skillnaden mellan "fotografera vår preview" och "fotografera
 * vad som helst på internet". Den låg i thumbnail-routen och saknades i
 * inspector-routen; testerna nedan låser fast beteendet nu när den är delad.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPreviewHostBaseUrl = vi.hoisted(() => vi.fn());

vi.mock("@/lib/gen/preview/tier2-config", () => ({ getPreviewHostBaseUrl }));

const ENV_KEY = "NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES";
const ORIGINAL_ENV = process.env[ENV_KEY];

beforeEach(() => {
  vi.clearAllMocks();
  getPreviewHostBaseUrl.mockReturnValue("https://preview.sajtmaskin.dev/p");
  delete process.env[ENV_KEY];
});

afterEach(() => {
  if (ORIGINAL_ENV === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = ORIGINAL_ENV;
});

describe("assertPreviewUrlAllowed", () => {
  it("släpper igenom preview-hostens egen origin under rätt path-prefix", async () => {
    const { assertPreviewUrlAllowed } = await import("./preview-allowlist");
    expect(assertPreviewUrlAllowed(new URL("https://preview.sajtmaskin.dev/p/abc"))).toEqual({
      ok: true,
    });
  });

  it("avvisar samma origin utanför path-prefixet", async () => {
    const { assertPreviewUrlAllowed } = await import("./preview-allowlist");
    const decision = assertPreviewUrlAllowed(new URL("https://preview.sajtmaskin.dev/annat"));
    expect(decision).toMatchObject({ ok: false, status: 403 });
  });

  it("avvisar en godtycklig publik värd", async () => {
    const { assertPreviewUrlAllowed } = await import("./preview-allowlist");
    const decision = assertPreviewUrlAllowed(new URL("https://angripare.example/x"));
    expect(decision).toMatchObject({ ok: false, status: 403 });
  });

  it("matchar operatörslistan som EXAKT värd, aldrig som suffix", async () => {
    // Hela skälet till att listan inte är en suffixlista: `fly.dev` som suffix
    // hade släppt in varje angriparkontrollerad Fly-app i vår Chromium.
    process.env[ENV_KEY] = "fly.dev";
    const { assertPreviewUrlAllowed } = await import("./preview-allowlist");

    expect(assertPreviewUrlAllowed(new URL("https://fly.dev/p/abc"))).toEqual({ ok: true });
    expect(assertPreviewUrlAllowed(new URL("https://angripare.fly.dev/p/abc"))).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("normaliserar operatörslistans poster (blanksteg, versaler, kantpunkter)", async () => {
    process.env[ENV_KEY] = " .Preview-Two.Example. , ";
    const { assertPreviewUrlAllowed } = await import("./preview-allowlist");
    expect(assertPreviewUrlAllowed(new URL("https://preview-two.example/x"))).toEqual({ ok: true });
  });

  it("fail-closed när preview-host-basen saknas", async () => {
    getPreviewHostBaseUrl.mockReturnValue("");
    const { assertPreviewUrlAllowed } = await import("./preview-allowlist");
    expect(assertPreviewUrlAllowed(new URL("https://preview.sajtmaskin.dev/p/a"))).toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("fail-closed när preview-host-basen inte går att tolka", async () => {
    getPreviewHostBaseUrl.mockReturnValue("inte-en-url");
    const { assertPreviewUrlAllowed } = await import("./preview-allowlist");
    expect(assertPreviewUrlAllowed(new URL("https://preview.sajtmaskin.dev/p/a"))).toMatchObject({
      ok: false,
      status: 503,
    });
  });

  it("bär anroparens etikett i felmeddelandet", async () => {
    const { assertPreviewUrlAllowed } = await import("./preview-allowlist");
    const decision = assertPreviewUrlAllowed(
      new URL("https://angripare.example/x"),
      "Inspector-capture",
    );
    expect(decision).toMatchObject({ ok: false });
    if (!decision.ok) expect(decision.error).toContain("Inspector-capture");
  });
});

describe("isAllowedCaptureUrl", () => {
  it("kräver både http(s) och allowlist", async () => {
    const { isAllowedCaptureUrl } = await import("./preview-allowlist");
    expect(isAllowedCaptureUrl(new URL("https://preview.sajtmaskin.dev/p/a"))).toBe(true);
    expect(isAllowedCaptureUrl(new URL("https://angripare.example/a"))).toBe(false);
  });

  it("avvisar ett tillåtet värdnamn på fel protokoll", async () => {
    // `file:`/`ws:` mot rätt värd är fortfarande inget vi fotograferar.
    const { isAllowedCaptureUrl } = await import("./preview-allowlist");
    expect(isAllowedCaptureUrl(new URL("ws://preview.sajtmaskin.dev/p/a"))).toBe(false);
  });
});
