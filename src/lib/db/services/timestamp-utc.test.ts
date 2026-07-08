/**
 * UTC-korrekthet för DB insert/update-hjälpare.
 *
 * Verifierar att alla skrivvägar som binder ett JS Date-objekt skickar faktiska
 * Date-instanser till Drizzle — INTE förformaterade lokaltidzsträngar.  Drizzle:s
 * PgTimestamp.mapToDriverValue(date) anropar date.toISOString() (alltid UTC med
 * Z-suffix), vilket PostgreSQL tolkar korrekt för TIMESTAMPTZ-kolumner oavsett
 * session-timezone.  En lokalformaterad sträng som "2026-07-08 07:41:26" (utan
 * tidszon) skulle orsaka 2 h drift om DB-sessionen är UTC+2 (bekräftat prod-fynd
 * 2026-07-08, se fix-timestamp-tz.sql).
 *
 * Testen mockar @/lib/db/client och fångar .values() / .set()-anropen.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── saveProjectData ──────────────────────────────────────────────────────────

const projectInsertCapture = vi.hoisted(() => ({
  values: undefined as unknown,
  onConflictSet: undefined as unknown,
}));

vi.mock("@/lib/db/client", () => {
  const db = {
    insert: () => ({
      values: (v: unknown) => {
        projectInsertCapture.values = v;
        return {
          onConflictDoUpdate: ({ set }: { set: unknown }) => {
            projectInsertCapture.onConflictSet = set;
            return Promise.resolve();
          },
        };
      },
    }),
    delete: () => ({
      where: () => Promise.resolve(),
    }),
    update: () => ({
      set: (_v: unknown) => ({
        where: () => ({
          returning: () => Promise.resolve([{ id: "row1" }]),
          // for void updates (no returning)
          then: (resolve: () => void) => Promise.resolve().then(resolve),
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
          orderBy: () => Promise.resolve([]),
        }),
      }),
    }),
  };
  return { db, dbConfigured: true };
});

const { saveProjectData } = await import("./projects");

describe("saveProjectData — timestamp UTC-korrekthet", () => {
  beforeEach(() => {
    projectInsertCapture.values = undefined;
    projectInsertCapture.onConflictSet = undefined;
  });

  it("skickar Date-objekt (inte lokal sträng) som created_at och updated_at", async () => {
    const before = new Date();
    await saveProjectData({ project_id: "proj_1", chat_id: "chat_1" });
    const after = new Date();

    const v = projectInsertCapture.values as Record<string, unknown>;
    expect(v).toBeDefined();

    expect(
      v.created_at instanceof Date,
      "created_at måste vara ett Date-objekt (aldrig en lokalt formaterad sträng)",
    ).toBe(true);

    expect(
      v.updated_at instanceof Date,
      "updated_at måste vara ett Date-objekt (aldrig en lokalt formaterad sträng)",
    ).toBe(true);

    const created = v.created_at as Date;
    const updated = v.updated_at as Date;

    // Värdena ska ligga nära now — inom 5 s (byggmaskinstolerans).
    expect(created.getTime()).toBeGreaterThanOrEqual(before.getTime() - 100);
    expect(created.getTime()).toBeLessThanOrEqual(after.getTime() + 5000);
    expect(updated.getTime()).toBeGreaterThanOrEqual(before.getTime() - 100);
    expect(updated.getTime()).toBeLessThanOrEqual(after.getTime() + 5000);
  });

  it("created_at.toISOString() avslutar med Z (UTC — aldrig lokal tid)", async () => {
    await saveProjectData({ project_id: "proj_2" });
    const v = projectInsertCapture.values as Record<string, unknown>;
    const created = v.created_at as Date;
    expect(created instanceof Date).toBe(true);
    // toISOString() är alltid UTC oavsett systemets lokala TZ
    expect(created.toISOString()).toMatch(/Z$/);
  });

  it("onConflictDoUpdate.set innehåller också ett Date-objekt för updated_at", async () => {
    await saveProjectData({ project_id: "proj_3", chat_id: "chat_3" });
    const s = projectInsertCapture.onConflictSet as Record<string, unknown>;
    expect(s).toBeDefined();
    expect(
      s.updated_at instanceof Date,
      "upsert-set.updated_at måste vara ett Date-objekt",
    ).toBe(true);
    expect((s.updated_at as Date).toISOString()).toMatch(/Z$/);
  });
});
