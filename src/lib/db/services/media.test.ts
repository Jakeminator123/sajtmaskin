import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { appProjects, images, mediaLibrary } from "@/lib/db/schema";

type FakeMedia = { user_id: string; project_id: string | null; file_type: string; file_path: string };
type FakeLegacy = { project_id: string; file_path: string };
const state = vi.hoisted(() => ({
  media: [] as FakeMedia[],
  legacy: [] as FakeLegacy[],
  projects: new Map<string, string>(),
  reservationStorage: true,
  reservations: [] as { userId: string; status: "pending" | "processing" | "failed" }[],
  locks: new Map<string, Promise<void>>(),
  events: [] as string[],
}));

vi.mock("./shared", () => ({ assertDbConfigured: () => undefined }));
vi.mock("@/lib/vercel/blob-service", () => ({ deleteBlob: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: {
    select: selection,
    execute: storageProbe,
    transaction: async (callback: (tx: unknown) => Promise<unknown>, options: unknown) => {
      expect(options).toEqual({ isolationLevel: "read committed" });
      let release: (() => void) | undefined;
      try {
        return await callback({
          select: selection,
          execute: async (statement: SQL) => {
            const { params, sql } = new PgDialect().sqlToQuery(statement);
            if (sql.includes("to_regclass")) return storageProbe(statement);
            expect(sql).toContain("pg_advisory_xact_lock");
            const key = String(params[0]);
            const earlier = state.locks.get(key);
            state.locks.set(key, new Promise<void>((resolve) => { release = resolve; }));
            await earlier;
            state.events.push(key);
          },
          insert: (table: unknown) => ({
            values: (row: FakeMedia | FakeLegacy) => ({
              returning: async () => {
                state.events.push("insert");
                if (table === images) state.legacy.push(row as FakeLegacy);
                else {
                  expect(table).toBe(mediaLibrary);
                  state.media.push(row as FakeMedia);
                }
                return [row];
              },
            }),
          }),
        });
      } finally {
        release?.();
      }
    },
  },
}));

function storageProbe(statement: SQL) {
  expect(new PgDialect().sqlToQuery(statement).sql).toContain("to_regclass('public.video_generation_jobs')");
  return Promise.resolve({ rows: [{ available: state.reservationStorage }] });
}

function selection(fields: { id?: unknown; images?: SQL; videos?: SQL; other?: SQL }) {
  return {
    from: (table: unknown) => ({
      where: (clause: SQL) => {
        const dialect = new PgDialect();
        const { params } = dialect.sqlToQuery(clause);
        if (table === appProjects) {
          const [id, owner] = params;
          const rows = typeof id === "string" && state.projects.get(id) === owner ? [{ id }] : [];
          return Object.assign(Promise.resolve(rows), {
            for: (mode: string) => {
              expect(mode).toBe("share");
              return Promise.resolve(rows);
            },
          });
        }
        expect(table).toBe(mediaLibrary);
        expect(dialect.sqlToQuery(clause).sql).toContain('"media_library"."user_id"');
        const [owner] = params;
        const rows = state.media.filter((row) => row.user_id === owner);
        const { params: scopeParams, sql: scopeSql } = dialect.sqlToQuery(fields.images!);
        if (!scopeParams.length) expect(scopeSql).toContain("is null");
        expect(scopeSql).toContain("in ('image', 'logo')");
        const scope = scopeParams[1] ?? null;
        const ownedImages = rows.filter((row) => row.project_id === scope && ["image", "logo"].includes(row.file_type));
        let imageCount = ownedImages.length;
        if (typeof scope === "string") {
          expect(scopeSql).toContain("union");
          expect(scopeParams).toEqual([owner, scope, scope, owner]);
          const legacy = state.projects.get(scope) === owner ? state.legacy.filter((row) => row.project_id === scope) : [];
          imageCount = new Set([...ownedImages, ...legacy].map((row) => row.file_path)).size;
        }
        const videoQuery = dialect.sqlToQuery(fields.videos!);
        const countsReservations = videoQuery.sql.includes('"video_generation_jobs"');
        expect(videoQuery.params).toEqual(countsReservations ? [owner] : []);
        if (countsReservations) expect(videoQuery.sql).toContain("in ('pending', 'processing')");
        const reserved = countsReservations ? state.reservations.filter((row) => row.userId === owner && row.status !== "failed").length : 0;
        const videoCount = rows.filter((row) => row.file_type === "video").length + reserved;
        state.events.push("count");
        // node-postgres returns COUNT as an int8 string.
        return Promise.resolve([{ images: String(imageCount), videos: String(videoCount), other: "0" }]);
      },
    }),
  };
}

import { canUserUploadFile, getMediaLibraryCounts, saveImage, saveMediaLibraryItem } from "./media";

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.stubEnv("RUNWAY_API_KEY", "provider-test");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-test");
  state.reservationStorage = true;
  state.media = [];
  state.legacy = [];
  state.reservations = [];
  state.projects = new Map([["a", "owner"], ["b", "owner"], ["other", "other-owner"]]);
  state.locks.clear();
  state.events = [];
});

function seed(userId: string, projectId: string | null, quantity: number, type = "image") {
  state.media.push(...Array.from({ length: quantity }, (_row, index) => ({
    user_id: userId, project_id: projectId, file_type: type, file_path: `${userId}/${projectId}/${type}-${index}.png`,
  })));
}

function save(projectId?: string, mimeType = "image/png") {
  return saveMediaLibraryItem("owner", "test.png", "test.png", "test.png", mimeType, 3, "https://example.org/test.png", projectId);
}

it("counts only the owner's images and logos in the selected bucket with independent personal and site capacity", async () => {
  seed("owner", "a", 199);
  seed("owner", "a", 1, "logo");
  seed("owner", "b", 19);
  seed("owner", null, 200, "logo");
  seed("other-owner", "b", 190);
  expect(await getMediaLibraryCounts("owner", "a")).toEqual({ images: 200, videos: 0, other: 0 });
  expect(await getMediaLibraryCounts("owner", "b")).toEqual({ images: 19, videos: 0, other: 0 });
  expect(await canUserUploadFile("owner", "image/png", "a")).toEqual({
    allowed: false, reason: "Sajten har nått gränsen på 200 bilder och logotyper.",
  });
  expect(await canUserUploadFile("owner", "image/png")).toEqual({
    allowed: false, reason: "Ditt personliga utrymme har nått gränsen på 200 bilder och logotyper.",
  });
  expect(await canUserUploadFile("owner", "image/png", "b")).toEqual({ allowed: true });
  await expect(save("b")).resolves.toMatchObject({ project_id: "b", user_id: "owner" });
});

it("rechecks image quota under the site lock and grants only one of the concurrent final slots", async () => {
  seed("owner", "a", 199);
  const legacy = () => saveImage("owner", "a", "legacy.png", "new-legacy.png", "legacy.png", "image/png", 1);
  const results = await Promise.allSettled([save("a"), legacy(), save("b")]);
  expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  expect(results[1]).toMatchObject({ reason: { status: 400 } });
  expect(state.events.filter((event) => event.includes("media-images"))).toContain('["media-images","owner","a"]');
  expect((await getMediaLibraryCounts("owner", "a")).images).toBe(200);
  expect((await getMediaLibraryCounts("owner", "b")).images).toBe(1);
});

it("counts legacy export assets once even if their path also appears in the media library", async () => {
  seed("owner", "a", 1);
  state.legacy.push(
    { project_id: "a", file_path: state.media[0].file_path },
    { project_id: "a", file_path: "legacy-only.png" },
    { project_id: "other", file_path: "foreign-only.png" },
  );
  expect((await getMediaLibraryCounts("owner", "a")).images).toBe(2);
  expect((await getMediaLibraryCounts("owner", "other")).images).toBe(0);
});

it("locks the same account-wide video quota across sites and personal uploads", async () => {
  seed("owner", "a", 1, "video");
  seed("owner", null, 1, "video");
  const results = await Promise.allSettled([save("a", "video/mp4"), save("b", "video/mp4")]);
  expect(results.map((result) => result.status)).toEqual(["fulfilled", "rejected"]);
  expect(await canUserUploadFile("owner", "video/mp4")).toEqual({
    allowed: false, reason: "Kontot har nått gränsen på 3 videor.",
  });
  expect(state.events.filter((event) => event.includes("media-videos"))).toEqual([
    '["media-videos","owner"]', '["media-videos","owner"]',
  ]);
});

it("includes active video orders in the ordinary account quota", async () => {
  seed("owner", "a", 1, "video");
  state.reservations.push(
    { userId: "owner", status: "pending" },
    { userId: "owner", status: "processing" },
    { userId: "owner", status: "failed" },
    { userId: "other-owner", status: "processing" },
  );
  expect((await getMediaLibraryCounts("owner", "b")).videos).toBe(3);
  expect(await canUserUploadFile("owner", "video/mp4", "b")).toMatchObject({ allowed: false });
  await expect(save("b", "video/mp4")).rejects.toMatchObject({ status: 400 });
});

it("rejects a foreign site before preflight and again at persistence after ownership changes", async () => {
  await expect(canUserUploadFile("owner", "image/png", "other")).rejects.toMatchObject({ status: 404 });
  expect(await canUserUploadFile("owner", "image/png", "a")).toEqual({ allowed: true });
  state.projects.set("a", "other-owner");
  await expect(save("a")).rejects.toMatchObject({ status: 404 });
  expect(state.media).toHaveLength(0);
});

it("keeps existing upload counts without the optional migration and honors outstanding jobs after key removal", async () => {
  vi.stubEnv("RUNWAY_API_KEY", "");
  state.reservations = [{ userId: "owner", status: "processing" }];
  state.reservationStorage = false;
  await expect(getMediaLibraryCounts("owner")).resolves.toEqual({ images: 0, videos: 0, other: 0 });
  state.reservationStorage = true;
  await expect(getMediaLibraryCounts("owner")).resolves.toEqual({ images: 0, videos: 1, other: 0 });
});
