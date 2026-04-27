/**
 * Unit-tests for `resolveDeploySeoOptions` precedence logic.
 *
 * Precedence: body-override > persisted `meta.seo` > null (env-fallback
 * handled inside the SEO core helper, returning null here means the
 * caller skips the apply-step and the env-fallback runs there if set).
 *
 * Pure-function test — no HTTP / DB mocking required.
 */

import { describe, expect, it } from "vitest";
import { resolveDeploySeoOptions } from "./resolve-seo";

describe("resolveDeploySeoOptions", () => {
  describe("body-override", () => {
    it("explicit optIn=false returns null even if persisted opted in", () => {
      const result = resolveDeploySeoOptions(
        { optIn: false },
        {
          optIn: true,
          siteUrl: "https://persisted.example.com",
          brand: null,
          lastSetAt: null,
        },
      );
      expect(result).toBeNull();
    });

    it("explicit optIn=true with siteUrl wins over persisted", () => {
      const result = resolveDeploySeoOptions(
        { optIn: true, siteUrl: "https://body.example.com" },
        {
          optIn: true,
          siteUrl: "https://persisted.example.com",
          brand: null,
          lastSetAt: null,
        },
      );
      expect(result).toEqual({
        siteUrl: "https://body.example.com",
        brand: undefined,
      });
    });

    it("body brand wins over persisted brand", () => {
      const result = resolveDeploySeoOptions(
        {
          optIn: true,
          siteUrl: "https://body.example.com",
          brand: { companyName: "Body Co" },
        },
        {
          optIn: true,
          siteUrl: "https://persisted.example.com",
          brand: { companyName: "Persisted Co", tagline: "Old" },
          lastSetAt: null,
        },
      );
      expect(result).toEqual({
        siteUrl: "https://body.example.com",
        brand: { companyName: "Body Co" },
      });
    });

    it("body without optIn but with siteUrl falls back to persisted opt-in flag", () => {
      const result = resolveDeploySeoOptions(
        // partial body — mimicking a future client that only sends overrides
        // (optIn is optional in the schema, so this is actually well-typed)
        { siteUrl: "https://body.example.com" },
        {
          optIn: true,
          siteUrl: "https://persisted.example.com",
          brand: null,
          lastSetAt: null,
        },
      );
      expect(result).toEqual({
        siteUrl: "https://body.example.com",
        brand: undefined,
      });
    });
  });

  // Regression for explicit-noop semantics. Body `siteUrl: null` must
  // ALWAYS opt out for this single deploy — the previous implementation
  // used `??` which silently fell through to persisted siteUrl when only
  // `siteUrl: null` was sent (without an `optIn` flag).
  describe("body siteUrl=null explicit-noop", () => {
    it("body { siteUrl: null } (no optIn) returns null even when persisted opted in", () => {
      const result = resolveDeploySeoOptions(
        { siteUrl: null },
        {
          optIn: true,
          siteUrl: "https://persisted.example.com",
          brand: { companyName: "Persisted Co" },
          lastSetAt: "2026-04-26T00:00:00Z",
        },
      );
      expect(result).toBeNull();
    });

    it("body { siteUrl: null } returns null when persisted opted out too", () => {
      const result = resolveDeploySeoOptions(
        { siteUrl: null },
        {
          optIn: false,
          siteUrl: null,
          brand: null,
          lastSetAt: null,
        },
      );
      expect(result).toBeNull();
    });

    it("body { siteUrl: null, brand: {...} } still opts out (brand alone can't rescue)", () => {
      const result = resolveDeploySeoOptions(
        { siteUrl: null, brand: { companyName: "Body Co" } },
        {
          optIn: true,
          siteUrl: "https://persisted.example.com",
          brand: null,
          lastSetAt: null,
        },
      );
      expect(result).toBeNull();
    });

    it("body { optIn: true, siteUrl: null } returns null (defensive — zod normally rejects this)", () => {
      // The zod schema's superRefine rejects optIn=true with siteUrl=null
      // before this resolver is reached, but the resolver must still
      // return null defensively if such a value somehow arrives.
      // Statically valid (optIn and siteUrl are independently optional/
      // nullable in the schema); only the runtime cross-field check
      // forbids the combination.
      const result = resolveDeploySeoOptions(
        { optIn: true, siteUrl: null },
        {
          optIn: true,
          siteUrl: "https://persisted.example.com",
          brand: null,
          lastSetAt: null,
        },
      );
      expect(result).toBeNull();
    });
  });

  describe("persisted-only", () => {
    it("returns persisted siteUrl + brand when optIn=true and no body override", () => {
      const result = resolveDeploySeoOptions(undefined, {
        optIn: true,
        siteUrl: "https://persisted.example.com",
        brand: { companyName: "Persisted Co" },
        lastSetAt: null,
      });
      expect(result).toEqual({
        siteUrl: "https://persisted.example.com",
        brand: { companyName: "Persisted Co" },
      });
    });

    it("returns null when persisted optIn=false", () => {
      const result = resolveDeploySeoOptions(undefined, {
        optIn: false,
        siteUrl: "https://persisted.example.com",
        brand: null,
        lastSetAt: null,
      });
      expect(result).toBeNull();
    });

    it("returns null when persisted optIn=true but siteUrl is empty", () => {
      const result = resolveDeploySeoOptions(undefined, {
        optIn: true,
        siteUrl: "",
        brand: null,
        lastSetAt: null,
      });
      expect(result).toBeNull();
    });
  });

  describe("nothing set", () => {
    it("returns null when neither body nor persisted opts in", () => {
      const result = resolveDeploySeoOptions(undefined, {
        optIn: false,
        siteUrl: "",
        brand: null,
        lastSetAt: null,
      });
      expect(result).toBeNull();
    });
  });
});
