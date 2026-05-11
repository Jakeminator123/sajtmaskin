import { afterEach, describe, expect, it, vi } from "vitest";
import manifest from "../../config/ai_models/manifest.json";
import envPolicy from "../../config/env-policy.json";
import { getKnownEnvKeys } from "./env-audit";
import { getServerEnv, resetServerEnvCacheForTests, serverSchema } from "./env";

function collectManifestEnvKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectManifestEnvKeys(item, keys);
    return keys;
  }

  if (!value || typeof value !== "object") return keys;

  const record = value as Record<string, unknown>;
  if (typeof record.envKey === "string") {
    keys.add(record.envKey);
  }
  for (const nested of Object.values(record)) {
    collectManifestEnvKeys(nested, keys);
  }
  return keys;
}

describe("server env schema", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetServerEnvCacheForTests();
  });

  it("covers every envKey declared by the AI model manifest", () => {
    const schemaKeys = new Set(Object.keys(serverSchema.shape));
    const missing = [...collectManifestEnvKeys(manifest)].filter((key) => !schemaKeys.has(key));

    expect(missing).toEqual([]);
  });

  it("keeps removed spec-first and template-guidance flags out of env policy", () => {
    const removedKeys = [
      "SAJTMASKIN_SPEC_MODEL",
      "SAJTMASKIN_MAX_AI_SPEC_PROMPT_CHARS",
      "SAJTMASKIN_RUNTIME_TEMPLATE_GUIDANCE",
      "SAJTMASKIN_USE_VARIANT_STRUCTURAL_FILES",
    ];
    const policyText = JSON.stringify(envPolicy);
    const manifestText = JSON.stringify(manifest);

    for (const key of removedKeys) {
      expect(policyText).not.toContain(key);
      expect(manifestText).not.toContain(key);
    }
  });

  it("makes server schema keys visible to env-audit tooling", () => {
    const known = new Set(getKnownEnvKeys());
    const missing = Object.keys(serverSchema.shape).filter((key) => !known.has(key));

    expect(missing).toEqual([]);
  });

  it("sanitizes quoted values before parsing and can reset the singleton cache", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", '  "https://example.com"  ');
    resetServerEnvCacheForTests();
    expect(getServerEnv().NEXT_PUBLIC_APP_URL).toBe("https://example.com");

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://changed.example.com");
    expect(getServerEnv().NEXT_PUBLIC_APP_URL).toBe("https://example.com");

    resetServerEnvCacheForTests();
    expect(getServerEnv().NEXT_PUBLIC_APP_URL).toBe("https://changed.example.com");
  });
});
