import { describe, expect, it } from "vitest";
import {
  aggregateKostnadsfriPixelRows,
  aggregateKostnadsfriVisitRows,
  pixelHitsTotal,
  pixelHitsWithinPeriod,
} from "./visit-stats";

function row(
  path: string,
  at: string,
  extras: { session_id?: string | null; ip_address?: string | null } = {},
) {
  return {
    path,
    session_id: extras.session_id ?? "sess",
    user_id: null,
    ip_address: extras.ip_address ?? "1.2.3.4",
    user_agent: "test",
    created_at: at,
    user_email: null,
  };
}

describe("aggregateKostnadsfriVisitRows", () => {
  it("splits landing visits by rent, animated and older mail", () => {
    const { perSlug, recent } = aggregateKostnadsfriVisitRows([
      row("/kostnadsfri/acme-ab?variant=animated", "2026-09-28T12:00:00.000Z"),
      row("/kostnadsfri/acme-ab?variant=rent", "2026-09-28T11:00:00.000Z", { session_id: "s2" }),
      row("/kostnadsfri/acme-ab", "2026-09-28T10:00:00.000Z", { session_id: "s3" }),
      row("/kostnadsfri/acme-ab/verifierad", "2026-09-28T12:05:00.000Z"),
      row("/kostnadsfri/acme-ab/skapad", "2026-09-28T12:10:00.000Z"),
    ]);

    expect(perSlug).toHaveLength(1);
    expect(perSlug[0]).toMatchObject({
      slug: "acme-ab",
      visits: 3,
      visitsByVariant: { rent: 1, animated: 1, unknown: 1 },
      uniqueVisitors: 3,
      uniqueByVariant: { rent: 1, animated: 1, unknown: 1 },
      verified: 1,
      started: 1,
    });
    expect(recent[0].variant).toBe("animated");
    expect(recent[2].variant).toBeNull();
  });

  it("does not return kod from a landing path to admin", () => {
    const { recent } = aggregateKostnadsfriVisitRows([
      row("/kostnadsfri/acme-ab?kod=hemligt&variant=rent", "2026-09-28T12:00:00.000Z"),
    ]);
    expect(recent[0]).toEqual({
      slug: "acme-ab",
      event: "besok",
      variant: "rent",
      at: "2026-09-28T12:00:00.000Z",
      userEmail: null,
      userId: null,
      sessionId: "sess",
      ipAddress: "1.2.3.4",
      userAgent: "test",
    });
    expect(JSON.stringify(recent)).not.toContain("hemligt");
    expect(recent[0]).not.toHaveProperty("kod");
  });

  it("does not invent a third mail sort for unknown variant query values", () => {
    const { perSlug } = aggregateKostnadsfriVisitRows([
      row("/kostnadsfri/acme-ab?variant=standardmail", "2026-09-28T10:00:00.000Z"),
      row("/kostnadsfri/acme-ab?variant=rentmail-v2", "2026-09-28T10:01:00.000Z"),
    ]);
    expect(perSlug[0].visitsByVariant).toEqual({ rent: 0, animated: 0, unknown: 2 });
  });
});

describe("aggregateKostnadsfriPixelRows", () => {
  it("counts each hit once per slug and kind", () => {
    const aggregated = aggregateKostnadsfriPixelRows([
      { slug: "acme-ab", kind: "rent", hit_at: "2026-09-20T08:00:00.000Z" },
      { slug: "acme-ab", kind: "rent", hit_at: "2026-09-21T08:00:00.000Z" },
      { slug: "acme-ab", kind: "animated", hit_at: "2026-09-22T08:00:00.000Z" },
      { slug: "acme-ab", kind: "html", hit_at: "2026-09-22T08:00:00.000Z" },
    ]);

    expect(aggregated).toEqual([
      {
        slug: "acme-ab",
        rent: {
          hits: 2,
          firstHitAt: "2026-09-20T08:00:00.000Z",
          lastHitAt: "2026-09-21T08:00:00.000Z",
        },
        animated: {
          hits: 1,
          firstHitAt: "2026-09-22T08:00:00.000Z",
          lastHitAt: "2026-09-22T08:00:00.000Z",
        },
      },
    ]);
    expect(pixelHitsTotal(aggregated[0])).toBe(3);
  });

  it("does not count hits from before the selected period", () => {
    const periodStart = new Date("2026-09-28T00:00:00.000Z");
    const older = Array.from({ length: 10 }, (_, index) => ({
      slug: "acme-ab",
      kind: "rent",
      hit_at: `2026-09-01T${String(index).padStart(2, "0")}:00:00.000Z`,
    }));
    const aggregated = pixelHitsWithinPeriod(
      [...older, { slug: "acme-ab", kind: "rent", hit_at: "2026-09-28T12:00:00.000Z" }],
      periodStart,
    );

    expect(aggregated).toEqual([
      {
        slug: "acme-ab",
        rent: {
          hits: 1,
          firstHitAt: "2026-09-28T12:00:00.000Z",
          lastHitAt: "2026-09-28T12:00:00.000Z",
        },
        animated: { hits: 0, firstHitAt: null, lastHitAt: null },
      },
    ]);
  });
});
