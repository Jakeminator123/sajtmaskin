import { describe, expect, it } from "vitest";
import { integrationRegistry } from "./registry";
import { loadPlaceholderRecord } from "@/lib/gen/sandbox/env-local";

describe("integrationRegistry parity", () => {
  it("has unique definition keys", () => {
    const keys = integrationRegistry.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique provider identity (provider ?? key) for detection map", () => {
    const ids = integrationRegistry.map((d) => d.provider ?? d.key);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("core registry envVars are covered by placeholder file", () => {
    const placeholderKeys = new Set(Object.keys(loadPlaceholderRecord()));
    const coreProviders = new Set([
      "stripe", "clerk", "next-auth", "supabase", "resend",
      "openai", "vercel-blob", "upstash", "contentful",
      "google-analytics", "gtm", "plausible", "posthog",
    ]);
    const missing: string[] = [];
    for (const def of integrationRegistry) {
      if (!coreProviders.has(def.key)) continue;
      for (const envVar of def.envVars) {
        if (!placeholderKeys.has(envVar)) {
          missing.push(`${def.key}: ${envVar} not in placeholders`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
