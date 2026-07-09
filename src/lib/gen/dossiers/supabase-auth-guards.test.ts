/**
 * Runtime contract tests for the supabase-auth dossier's security guards
 * (legacy-import wave 3). Imports the dossier files DIRECTLY from
 * data/dossiers/ (same pattern as dossier-config-fallback.test.tsx) — both
 * helpers are dependency-free so they unit-test standalone:
 *
 *  1. `sanitizeNextPath` — the OAuth callback's open-redirect fix. Only a
 *     same-origin relative path starting with a single "/" may survive;
 *     absolute URLs, scheme prefixes, protocol-relative "//host", backslash
 *     smuggling and control characters must all fall back to "/".
 *  2. `isSupabaseAuthConfigured` / `getSupabaseAuthConfig` — the lazy env
 *     guard (mock: none). Missing OR placeholder values (F2 preview stubs,
 *     dummy/changeme/your_-style stand-ins) count as NOT configured, so the
 *     UI shows the "Auth ej konfigurerat" notice instead of the SDK throwing.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  sanitizeNextPath,
} from "../../../../data/dossiers/hard/supabase-auth/components/lib/supabase/safe-redirect";
import {
  getSupabaseAuthConfig,
  isSupabaseAuthConfigured,
  SUPABASE_AUTH_NOT_CONFIGURED,
} from "../../../../data/dossiers/hard/supabase-auth/components/lib/supabase/config";

describe("sanitizeNextPath — safe same-origin relative paths pass through", () => {
  it("keeps the root path", () => {
    expect(sanitizeNextPath("/")).toBe("/");
  });

  it("keeps a plain relative path", () => {
    expect(sanitizeNextPath("/dashboard")).toBe("/dashboard");
  });

  it("keeps query string and hash", () => {
    expect(sanitizeNextPath("/konto/installningar?tab=1#top")).toBe(
      "/konto/installningar?tab=1#top",
    );
  });

  it("trims surrounding whitespace before validating", () => {
    expect(sanitizeNextPath("  /dashboard  ")).toBe("/dashboard");
  });

  it("normalizes path traversal against the origin (never escapes it)", () => {
    expect(sanitizeNextPath("/foo/../bar")).toBe("/bar");
  });
});

describe("sanitizeNextPath — open-redirect payloads fall back to '/'", () => {
  it("rejects null / undefined / empty", () => {
    expect(sanitizeNextPath(null)).toBe("/");
    expect(sanitizeNextPath(undefined)).toBe("/");
    expect(sanitizeNextPath("")).toBe("/");
  });

  it("rejects absolute http/https URLs", () => {
    expect(sanitizeNextPath("https://evil.example")).toBe("/");
    expect(sanitizeNextPath("http://evil.example/phish")).toBe("/");
    expect(sanitizeNextPath(" https://evil.example")).toBe("/");
  });

  it("rejects scheme-prefixed payloads (javascript:, data:, mailto:)", () => {
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/");
    expect(sanitizeNextPath("data:text/html,<script>alert(1)</script>")).toBe("/");
    expect(sanitizeNextPath("mailto:x@evil.example")).toBe("/");
  });

  it("rejects protocol-relative '//host' payloads (incl. '///')", () => {
    expect(sanitizeNextPath("//evil.example")).toBe("/");
    expect(sanitizeNextPath("//evil.example/phish")).toBe("/");
    expect(sanitizeNextPath("///evil.example")).toBe("/");
  });

  it("rejects backslash-smuggled hosts", () => {
    expect(sanitizeNextPath("/\\evil.example")).toBe("/");
    expect(sanitizeNextPath("\\/evil.example")).toBe("/");
    expect(sanitizeNextPath("/foo\\bar")).toBe("/");
  });

  it("rejects raw control characters in the path", () => {
    expect(sanitizeNextPath("/foo\nbar")).toBe("/");
    expect(sanitizeNextPath("/foo\tbar")).toBe("/");
    expect(sanitizeNextPath("/foo\u0000bar")).toBe("/");
  });

  it("rejects a path missing the leading slash", () => {
    expect(sanitizeNextPath("dashboard")).toBe("/");
    expect(sanitizeNextPath("evil.example/phish")).toBe("/");
  });

  it("honors a custom fallback for rejected values", () => {
    expect(sanitizeNextPath("https://evil.example", "/konto")).toBe("/konto");
  });
});

describe("supabase-auth env guard — lazy config (mock: none)", () => {
  const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("reports not configured when env vars are missing, and the factory guard throws the typed error", () => {
    expect(isSupabaseAuthConfigured()).toBe(false);
    expect(() => getSupabaseAuthConfig()).toThrowError(SUPABASE_AUTH_NOT_CONFIGURED);
  });

  it("treats F2 preview stub values as NOT configured (placeholder-aware on ALL keys)", () => {
    // The exact deterministic stub format the preview seeds for dossier keys.
    process.env.NEXT_PUBLIC_SUPABASE_URL =
      "next_public_supabase_url_placeholder_preview_not_real";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
      "next_public_supabase_anon_key_placeholder_preview_not_real";
    expect(isSupabaseAuthConfigured()).toBe(false);
    expect(() => getSupabaseAuthConfig()).toThrowError(SUPABASE_AUTH_NOT_CONFIGURED);
  });

  it("treats dummy/changeme/your_-style stand-ins as NOT configured", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://dummy.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "changeme";
    expect(isSupabaseAuthConfigured()).toBe(false);

    process.env.NEXT_PUBLIC_SUPABASE_URL = "your_supabase_url";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiJ9.real-looking";
    expect(isSupabaseAuthConfigured()).toBe(false);
  });

  it("is not configured when only ONE key is real", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc123.supabase.co";
    expect(isSupabaseAuthConfigured()).toBe(false);
    expect(() => getSupabaseAuthConfig()).toThrowError(SUPABASE_AUTH_NOT_CONFIGURED);
  });

  it("returns the validated config when both values are real", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc123.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiJ9.anon-key";
    expect(isSupabaseAuthConfigured()).toBe(true);
    expect(getSupabaseAuthConfig()).toEqual({
      url: "https://abc123.supabase.co",
      anonKey: "eyJhbGciOiJIUzI1NiJ9.anon-key",
    });
  });
});
