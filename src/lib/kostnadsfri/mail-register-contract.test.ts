import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeKostnadsfriGeneration,
  parseKostnadsfriRegisterEnvelopes,
  parseKostnadsfriRegisterResponse,
  resolveKostnadsfriGenerationProjection,
} from "./mail-register-contract";

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), "docs", "mail-register-contract.fixture.json"), "utf8"),
) as unknown;

describe("kostnadsfri mail register contract", () => {
  it("classifies the synthetic GET fixture without inventing legacy provenance", () => {
    const pages = parseKostnadsfriRegisterResponse(fixture);
    expect(pages).toHaveLength(3);
    expect(pages.map((page) => page.mailType).sort()).toEqual([
      "animated",
      "text",
      "unregistered",
    ]);
    expect(pages.filter((page) => page.generation.state === "succeeded")).toHaveLength(1);
    expect(pages.filter((page) => page.generation.state === "in-progress")).toHaveLength(1);
    expect(pages.filter((page) => page.generation.state === "unknown")).toHaveLength(1);
    expect(pages.find((page) => page.slug === "legacy-ab")?.started).toBe(1);
  });

  it("degrades missing or invalid generation independently of the send row", () => {
    expect(normalizeKostnadsfriGeneration(undefined).state).toBe("unknown");
    expect(
      normalizeKostnadsfriGeneration({
        state: "succeeded",
        completedAt: "999999-01-01T00:00:00Z",
        siteId: "site_1",
      }),
    ).toEqual({ state: "unknown", completedAt: null, siteId: null });
    expect(
      normalizeKostnadsfriGeneration({
        state: "in-progress",
        completedAt: "2026-10-01T00:00:00Z",
        siteId: null,
      }).state,
    ).toBe("unknown");
  });

  it("does not infer an accepted mail or generation from URL correlation fields", () => {
    const pages = parseKostnadsfriRegisterResponse({
      ...(fixture as Record<string, unknown>),
      pages: [
        {
          ...(fixture as { pages: Record<string, unknown>[] }).pages[0],
          source: null,
          sentAt: null,
          generation: undefined,
          url: "/kostnadsfri/textbolaget-ab?mail_id=abc&variant=animated",
        },
      ],
    });
    expect(pages[0].mailType).toBe("unregistered");
    expect(pages[0].generation.state).toBe("unknown");
  });

  it("projects only server-owned generation milestones", () => {
    expect(
      resolveKostnadsfriGenerationProjection({
        projectId: "site_1",
        initialChatId: null,
        initialVersionId: null,
        completedAt: null,
        latestGenerationSucceeded: null,
      }).state,
    ).toBe("not-started");
    expect(
      resolveKostnadsfriGenerationProjection({
        projectId: "site_1",
        initialChatId: "chat_1",
        initialVersionId: null,
        completedAt: null,
        latestGenerationSucceeded: null,
      }).state,
    ).toBe("in-progress");
    expect(
      resolveKostnadsfriGenerationProjection({
        projectId: "site_1",
        initialChatId: "chat_1",
        initialVersionId: null,
        completedAt: null,
        latestGenerationSucceeded: false,
      }).state,
    ).toBe("failed");
    expect(
      resolveKostnadsfriGenerationProjection({
        projectId: "site_1",
        initialChatId: "chat_1",
        initialVersionId: "version_1",
        completedAt: new Date("2026-10-03T08:42:00Z"),
        latestGenerationSucceeded: true,
      }),
    ).toEqual({
      state: "succeeded",
      completedAt: "2026-10-03T08:42:00.000Z",
      siteId: "site_1",
    });
  });

  describe("advertised metadata envelopes", () => {
    const base = fixture as Record<string, Record<string, unknown>>;
    const withEnvelope = (key: string, patch: Record<string, unknown> | undefined) => {
      const copy: Record<string, unknown> = structuredClone(fixture) as Record<string, unknown>;
      if (patch === undefined) delete copy[key];
      else copy[key] = { ...base[key], ...patch };
      return copy;
    };

    it("validates registry, analytics and generation on the fixture", () => {
      expect(parseKostnadsfriRegisterEnvelopes(fixture)).toEqual({
        registry: base.registry,
        analytics: base.analytics,
        generation: base.generation,
      });
    });

    it("rejects a response that omits any envelope", () => {
      for (const key of ["registry", "analytics", "generation"]) {
        expect(() => parseKostnadsfriRegisterResponse(withEnvelope(key, undefined))).toThrow();
      }
    });

    it("rejects corrupted pagination metadata", () => {
      for (const patch of [
        { complete: false, nextCursor: null },
        { complete: true, nextCursor: "11" },
        { complete: "yes" },
        { nextCursor: "11abc", complete: false },
        { returned: -1 },
      ]) {
        expect(() => parseKostnadsfriRegisterEnvelopes(withEnvelope("registry", patch))).toThrow();
      }
    });

    it("accepts a capped partial read with partial-unavailable analytics and generation", () => {
      const partial = {
        ...(structuredClone(fixture) as Record<string, unknown>),
        pages: (fixture as { pages: Record<string, unknown>[] }).pages.map((page) => ({
          ...page,
          visits: null,
          verified: null,
          started: null,
          generation: undefined,
        })),
        registry: { ...base.registry, complete: false, nextCursor: "0", paginationMode: "legacy-send-order" },
        analytics: { ...base.analytics, available: false, complete: false },
        generation: { ...base.generation, available: false },
      };
      const envelopes = parseKostnadsfriRegisterEnvelopes(partial);
      expect(envelopes.registry).toMatchObject({ complete: false, nextCursor: "0" });
      expect(envelopes.analytics).toMatchObject({ available: false, complete: false });
      expect(envelopes.generation.available).toBe(false);
      // A legacy row without generation still degrades to unknown, row kept.
      const legacy = parseKostnadsfriRegisterResponse(partial).find((p) => p.slug === "legacy-ab");
      expect(legacy?.generation.state).toBe("unknown");
    });

    it.each(["visits", "verified", "started"])(
      "rejects numeric %s when analytics is unavailable in both parsers",
      (field) => {
        const contradictory = withEnvelope("analytics", { available: false, complete: false });
        for (const parse of [parseKostnadsfriRegisterResponse, parseKostnadsfriRegisterEnvelopes]) {
          expect(() => parse(contradictory)).toThrow();
          const valid = structuredClone(contradictory) as { pages: Record<string, unknown>[] };
          valid.pages = valid.pages.map((page) => ({ ...page, visits: null, verified: null, started: null }));
          expect(() => parse(valid)).not.toThrow();
          valid.pages[0][field] = 0;
          expect(() => parse(valid)).toThrow();
        }
      },
    );

    it("requires unknown generation while unavailable but keeps legacy fallback", () => {
      const unavailable = withEnvelope("generation", { available: false }) as {
        pages: Record<string, unknown>[];
      };
      for (const parse of [parseKostnadsfriRegisterResponse, parseKostnadsfriRegisterEnvelopes]) {
        expect(() => parse(unavailable)).toThrow();
        const legacy = structuredClone(unavailable);
        legacy.pages = legacy.pages.map((page) => ({ ...page, generation: undefined }));
        expect(() => parse(legacy)).not.toThrow();
        legacy.pages[0].generation = { state: "unknown", completedAt: null, siteId: null };
        expect(() => parse(legacy)).not.toThrow();
        legacy.pages[0].generation = { state: "in-progress", completedAt: null, siteId: null };
        expect(() => parse(legacy)).toThrow();
      }
    });

    it("rejects analytics that claims completeness while unavailable", () => {
      expect(() =>
        parseKostnadsfriRegisterEnvelopes(withEnvelope("analytics", { available: false, complete: true })),
      ).toThrow();
    });
  });
});
