import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeKostnadsfriGeneration,
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
      success: true,
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
});
