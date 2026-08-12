/**
 * Parity invariants for the per-key placeholder classification.
 *
 * The TS set `PLACEHOLDER_HARMLESS_ENV_KEYS` and the two on-disk env
 * fragment files (`config/ai_models/40-harmless-placeholders.env.txt`,
 * `41-tier3-stub-placeholders.env.txt`) must agree, otherwise:
 *
 *  - A key classified as harmless in TS but missing from `40-` would not
 *    end up in the preview `.env.local` merge — the project would boot
 *    with a missing var even though the runtime "knew" it was safe.
 *
 *  - A key listed in `41-` (tier-3 stub) that is *also* in
 *    `PLACEHOLDER_HARMLESS_ENV_KEYS` would mean F3 strips it from the
 *    merge (F3 drops the tier-3-stub layer) even though the runtime
 *    classifier says it's safe to keep.
 *
 *  - A registry-declared `envVars` entry for a generic, ambiguous, or
 *    dossierless provider that has no placeholder in either file would crash
 *    F2 preview. A uniquely dossier-owned provider is different: selected
 *    dossier keys receive deterministic fallback values in `env-local.ts`.
 *
 * The third check is the one that historically caught Sanity, MongoDB
 * and Vercel KV missing from the stub file even though their
 * integrations were live in `integrationRegistry`.
 *
 * This complements `registry-parity.test.ts`, which only checks a
 * hand-picked "core providers" subset.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveDossierProvider } from "@/lib/gen/dossiers/registry";
import { dossierMockPreviewEnvValue } from "@/lib/gen/preview/env-local";

import { isLikelyStubEnvValue } from "./stub-env-filter";
import { integrationRegistry } from "./registry";
import { PLACEHOLDER_HARMLESS_ENV_KEYS } from "./placeholder-harmless";

function repoPath(...segments: string[]): string {
  return path.join(process.cwd(), ...segments);
}

function parseEnvFragmentKeys(absPath: string): string[] {
  const text = readFileSync(absPath, "utf8");
  const keys: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (key) keys.push(key);
  }
  return keys;
}

const HARMLESS_FRAGMENT = repoPath("config", "ai_models", "40-harmless-placeholders.env.txt");
const TIER3_STUB_FRAGMENT = repoPath("config", "ai_models", "41-tier3-stub-placeholders.env.txt");

function catalogPlaceholderKeys(): Set<string> {
  return new Set([
    ...parseEnvFragmentKeys(HARMLESS_FRAGMENT),
    ...parseEnvFragmentKeys(TIER3_STUB_FRAGMENT),
  ]);
}

function missingCatalogEnvVars(providerKey: string): string[] {
  const definition = integrationRegistry.find((entry) => entry.key === providerKey);
  if (!definition) return [];
  const catalogKeys = catalogPlaceholderKeys();
  return definition.envVars.filter((key) => !catalogKeys.has(key)).sort();
}

describe("placeholder-harmless × env-fragment parity", () => {
  it("PLACEHOLDER_HARMLESS_ENV_KEYS is exactly the key set of 40-harmless-placeholders.env.txt", () => {
    const tsSet = new Set(PLACEHOLDER_HARMLESS_ENV_KEYS);
    const fileSet = new Set(parseEnvFragmentKeys(HARMLESS_FRAGMENT));

    const inTsOnly = [...tsSet].filter((k) => !fileSet.has(k)).sort();
    const inFileOnly = [...fileSet].filter((k) => !tsSet.has(k)).sort();

    expect(
      inTsOnly,
      `In PLACEHOLDER_HARMLESS_ENV_KEYS but missing from 40-harmless-placeholders.env.txt:\n  ${inTsOnly.join(", ") || "(none)"}`,
    ).toEqual([]);
    expect(
      inFileOnly,
      `In 40-harmless-placeholders.env.txt but missing from PLACEHOLDER_HARMLESS_ENV_KEYS:\n  ${inFileOnly.join(", ") || "(none)"}`,
    ).toEqual([]);
  });

  it("41-tier3-stub-placeholders.env.txt does not overlap PLACEHOLDER_HARMLESS_ENV_KEYS", () => {
    const tier3Keys = parseEnvFragmentKeys(TIER3_STUB_FRAGMENT);
    const overlap = tier3Keys.filter((k) => PLACEHOLDER_HARMLESS_ENV_KEYS.has(k)).sort();
    expect(
      overlap,
      `Tier-3 stub fragment overlaps harmless set (would be stripped in F3 by mistake):\n  ${overlap.join(", ") || "(none)"}`,
    ).toEqual([]);
  });

  it("requires catalog placeholders unless a unique dossier owns the provider", () => {
    const catalogKeys = catalogPlaceholderKeys();
    const missing: string[] = [];
    for (const def of integrationRegistry) {
      const provider = (def.provider ?? def.key).trim().toLowerCase();
      if (resolveDossierProvider(provider).status === "unique") continue;
      for (const envVar of def.envVars) {
        if (!catalogKeys.has(envVar)) {
          missing.push(`${def.key}: ${envVar}`);
        }
      }
    }
    expect(
      missing,
      `Generic/ambiguous/dossierless registry envVars without a catalog placeholder:\n  ${missing.join("\n  ") || "(none)"}`,
    ).toEqual([]);
  });

  it("lets unique Resend and Sentry use selected-dossier fallback values", () => {
    expect(resolveDossierProvider("resend").status).toBe("unique");
    expect(missingCatalogEnvVars("resend")).toEqual(["CONTACT_EMAIL_TO", "EMAIL_FROM"]);

    expect(resolveDossierProvider("sentry").status).toBe("unique");
    expect(missingCatalogEnvVars("sentry")).toEqual([
      "SENTRY_ENVIRONMENT",
      "SENTRY_TRACES_SAMPLE_RATE",
    ]);
  });

  it("generates a recognized stub for every uncovered unique-provider env", () => {
    const catalogKeys = catalogPlaceholderKeys();
    const fallbackKeys: string[] = [];
    for (const definition of integrationRegistry) {
      const provider = (definition.provider ?? definition.key).trim().toLowerCase();
      if (resolveDossierProvider(provider).status !== "unique") continue;
      for (const key of definition.envVars) {
        if (catalogKeys.has(key)) continue;
        const fallback = dossierMockPreviewEnvValue(key);
        expect(fallback).toBeTruthy();
        expect(isLikelyStubEnvValue(fallback), `${definition.key}: ${key}`).toBe(true);
        fallbackKeys.push(`${definition.key}: ${key}`);
      }
    }
    expect(fallbackKeys).toEqual(
      expect.arrayContaining([
        "resend: EMAIL_FROM",
        "resend: CONTACT_EMAIL_TO",
        "sentry: SENTRY_ENVIRONMENT",
        "sentry: SENTRY_TRACES_SAMPLE_RATE",
      ]),
    );
  });
});
