import { describe, expect, it } from "vitest";
import { resolveDossierProvider } from "@/lib/gen/dossiers/registry";
import { loadPlaceholderKeySet } from "@/lib/gen/preview/env-local";

import { integrationRegistry } from "./registry";

describe("integrationRegistry parity", () => {
  it("has unique definition keys", () => {
    const keys = integrationRegistry.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has unique provider identity (provider ?? key) for detection map", () => {
    const ids = integrationRegistry.map((d) => d.provider ?? d.key);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("core registry envVars have catalog coverage unless a unique dossier owns them", () => {
    const placeholderKeys = loadPlaceholderKeySet({ includeTier3Stubs: true });
    const coreProviders = new Set([
      "stripe",
      "clerk",
      "next-auth",
      "supabase",
      "resend",
      "openai",
      "vercel-blob",
      "upstash",
      "contentful",
      "google-analytics",
      "gtm",
      "plausible",
      "posthog",
    ]);
    const missing: string[] = [];
    for (const def of integrationRegistry) {
      if (!coreProviders.has(def.key)) continue;
      const provider = (def.provider ?? def.key).trim().toLowerCase();
      if (resolveDossierProvider(provider).status === "unique") continue;
      for (const envVar of def.envVars) {
        if (!placeholderKeys.has(envVar)) {
          missing.push(`${def.key}: ${envVar} not in placeholders`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  /**
   * Regressionen som fixades: projektionen räknades ut på modulnivå och
   * frystes vid import, så dossier-registrets mtime-cache aldrig nådde fram
   * — ett manifest redigerat i backoffice eller under dev hot reload fortsatte
   * servera gamla env-nycklar tills processen startades om. En accessor kan
   * inte frysas på det sättet; en data-property kan det.
   */
  it("projects manifest-owned fields lazily, not frozen at import", () => {
    const resend = integrationRegistry.find((d) => d.key === "resend");
    expect(resend).toBeDefined();
    for (const field of ["envVars", "setupGuide"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(resend!, field);
      expect(descriptor?.get, `${field} must stay an accessor`).toBeTypeOf("function");
    }
    // Lathten får inte kosta korrekthet: värdet är fortfarande manifestets.
    expect(resend!.envVars).toEqual(["RESEND_API_KEY", "EMAIL_FROM", "CONTACT_EMAIL_TO"]);
    expect(resend!.envVars).toEqual(resend!.envVars);
  });
});
