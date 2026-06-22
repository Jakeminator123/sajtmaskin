import { afterEach, describe, expect, it, vi } from "vitest";

// `DID_AVATAR_AVAILABLE` is computed once at module load from public env, so each
// scenario stubs the env and re-imports the module fresh.
async function loadGate() {
  vi.resetModules();
  return import("./use-did-avatar");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("DID_AVATAR_AVAILABLE enable-flag gate", () => {
  it("stays inactive when the flag is unset, even with both keys present", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_AGENT_ID", "v2_agt_test");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_CLIENT_KEY", "client-key");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "");

    const mod = await loadGate();

    expect(mod.AVATAR_KEYS_PRESENT).toBe(true);
    expect(mod.AVATAR_FLAG_ENABLED).toBe(false);
    expect(mod.DID_AVATAR_AVAILABLE).toBe(false);
  });

  it("stays inactive when the flag is set to something other than '1'", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_AGENT_ID", "v2_agt_test");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_CLIENT_KEY", "client-key");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "true");

    const mod = await loadGate();

    expect(mod.DID_AVATAR_AVAILABLE).toBe(false);
  });

  it("stays inactive when the flag is on but a key is missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_AGENT_ID", "");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_CLIENT_KEY", "client-key");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "1");

    const mod = await loadGate();

    expect(mod.AVATAR_FLAG_ENABLED).toBe(true);
    expect(mod.AVATAR_KEYS_PRESENT).toBe(false);
    expect(mod.DID_AVATAR_AVAILABLE).toBe(false);
  });

  it("is active only when the flag is '1' and both keys are present", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_AGENT_ID", "v2_agt_test");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_CLIENT_KEY", "client-key");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", "1");

    const mod = await loadGate();

    expect(mod.DID_AVATAR_AVAILABLE).toBe(true);
  });

  it("trims quotes/whitespace around the flag value before comparing", async () => {
    vi.stubEnv("NEXT_PUBLIC_AVATAR_AGENT_ID", "v2_agt_test");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_CLIENT_KEY", "client-key");
    vi.stubEnv("NEXT_PUBLIC_AVATAR_ENABLED", '"1"');

    const mod = await loadGate();

    expect(mod.AVATAR_FLAG_ENABLED).toBe(true);
    expect(mod.DID_AVATAR_AVAILABLE).toBe(true);
  });
});
