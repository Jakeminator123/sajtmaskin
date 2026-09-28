// @vitest-environment node
/**
 * Pixel hits for the kostnadsfri mail against real Postgres.
 *
 * Part 1 applies the real migration inside one rolled-back transaction, to a
 * schema with the first draft shape (one summed row per recipient with
 * UNIQUE (email, slug, kind)) and to an empty schema.
 *
 * Part 2 drives the real `GET /api/kostnadsfri/pixel.gif` handler, its service
 * and the app's own pool. Those writes are committed by the app pool, so this
 * part only runs against a throwaway local database (CI's service container or
 * a local instance) and deletes its own rows afterwards. Against a remote dev
 * database it is skipped, so the shared table is never written.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { config as loadEnvFile } from "dotenv";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { checkDbEnvTarget, loadDbTargets, resolveConfiguredDbUrl } from "./check-db-env-target.mjs";
import { resolveSslConfig } from "./db-ssl.mjs";

if (existsSync(".env.local")) loadEnvFile({ path: ".env.local", override: false });

function resolveDevDbUrl(): { url: string | null; reason: string } {
  const resolved = resolveConfiguredDbUrl(process.env);
  if (!resolved) return { url: null, reason: "ingen databas-URL i env" };
  const verdict = checkDbEnvTarget({
    expect: "dev",
    urlValue: resolved.value,
    targets: loadDbTargets(),
  });
  return verdict.ok
    ? { url: resolved.value, reason: verdict.message }
    : { url: null, reason: verdict.message };
}

function isLocalHost(url: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

const target = resolveDevDbUrl();
const localUrl = target.url && isLocalHost(target.url) ? target.url : null;
const requireDb = process.env.REQUIRE_POSTGRES_TESTS?.trim() === "1";

if (!target.url || !localUrl) {
  const message = !target.url
    ? `[kostnadsfri-pixel-hits.postgres] ingen användbar dev-databas: ${target.reason}.`
    : "[kostnadsfri-pixel-hits.postgres] databasen är inte lokal; endpointdelen skriver via appens pool och körs bara mot en lokal engångsdatabas.";
  if (requireDb) {
    throw new Error(`${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel.`);
  }
  console.warn(`${message} Delar SKIPPAS.`);
}

const migrationPath = join(
  process.cwd(),
  "src",
  "lib",
  "db",
  "migrations",
  "add-kostnadsfri-pixel-hits.sql",
);

/** The first draft shape from 5e89401, which dev already has. */
const LEGACY_TABLE_SQL = `
  CREATE TABLE kostnadsfri_pixel_hits (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    slug TEXT NOT NULL,
    kind TEXT NOT NULL,
    hit_count INTEGER NOT NULL DEFAULT 1,
    first_hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_hit_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT kostnadsfri_pixel_hits_email_slug_kind_unique UNIQUE (email, slug, kind)
  );
  CREATE INDEX idx_kostnadsfri_pixel_hits_slug_kind ON kostnadsfri_pixel_hits (slug, kind);
`;

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

const iso = (value: Date | string) => new Date(value).toISOString();

describe.skipIf(!target.url)("kostnadsfri_pixel_hits-migrationen mot riktig Postgres", () => {
  const runTag = randomUUID().replaceAll("-", "").slice(0, 16);
  const legacySchema = quoteIdentifier(`pixel_legacy_${runTag}`);
  const freshSchema = quoteIdentifier(`pixel_fresh_${runTag}`);
  let client: Client;
  let migrationSql: string;

  async function useSchema(schema: string): Promise<void> {
    await client.query(`SET LOCAL search_path = ${schema}, pg_catalog`);
  }

  async function tableShape() {
    const columns = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'kostnadsfri_pixel_hits'
        ORDER BY column_name`,
    );
    const constraints = await client.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = 'kostnadsfri_pixel_hits'::regclass AND contype IN ('p', 'u', 'c', 'f')
        ORDER BY conname`,
    );
    const indexes = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname = current_schema() AND tablename = 'kostnadsfri_pixel_hits'
        ORDER BY indexname`,
    );
    return {
      columns: columns.rows.map((row) => row.column_name),
      constraints: constraints.rows.map((row) => row.conname),
      indexes: indexes.rows.map((row) => row.indexname),
    };
  }

  beforeAll(async () => {
    migrationSql = await readFile(migrationPath, "utf8");
    client = new Client({ connectionString: target.url!, ssl: resolveSslConfig(target.url!) });
    await client.connect();
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA ${legacySchema}`);
    await client.query(`CREATE SCHEMA ${freshSchema}`);
  }, 60_000);

  afterAll(async () => {
    if (!client) return;
    await client.query("ROLLBACK").catch(() => null);
    await client.end().catch(() => null);
  }, 60_000);

  it("creates one row per hit in an empty database and is idempotent", async () => {
    await useSchema(freshSchema);
    await client.query(migrationSql);
    await client.query(migrationSql);

    expect(await tableShape()).toEqual({
      columns: ["email", "hit_at", "id", "kind", "slug"],
      constraints: ["kostnadsfri_pixel_hits_pkey"],
      indexes: [
        "idx_kostnadsfri_pixel_hits_period",
        "idx_kostnadsfri_pixel_hits_recipient",
        "kostnadsfri_pixel_hits_pkey",
      ],
    });
  });

  it("upgrades the first draft shape without losing data, and a rerun changes nothing", async () => {
    await useSchema(legacySchema);
    await client.query(LEGACY_TABLE_SQL);
    await client.query(
      `INSERT INTO kostnadsfri_pixel_hits (email, slug, kind, hit_count, first_hit_at, last_hit_at)
       VALUES ('a@example.test', 's1', 'rent', 3, '2026-09-20T08:00:00Z', '2026-09-25T09:00:00Z'),
              ('b@example.test', 's1', 'animated', 1, '2026-09-21T08:00:00Z', '2026-09-21T08:00:00Z')`,
    );
    const before = await client.query(
      `SELECT id, email, hit_count, first_hit_at, last_hit_at FROM kostnadsfri_pixel_hits ORDER BY id`,
    );

    await client.query(migrationSql);
    const readHits = () =>
      client.query<{ email: string; kind: string; hit_at: Date }>(
        `SELECT email, kind, hit_at FROM kostnadsfri_pixel_hits ORDER BY email, hit_at DESC, id`,
      );
    const afterFirst = await readHits();
    await client.query(migrationSql);
    const afterSecond = await readHits();

    expect(afterSecond.rows).toEqual(afterFirst.rows);
    expect(afterFirst.rows.map((row) => [row.email, row.kind, iso(row.hit_at)])).toEqual([
      ["a@example.test", "rent", "2026-09-25T09:00:00.000Z"],
      ["a@example.test", "rent", "2026-09-20T08:00:00.000Z"],
      ["a@example.test", "rent", "2026-09-20T08:00:00.000Z"],
      ["b@example.test", "animated", "2026-09-21T08:00:00.000Z"],
    ]);

    const originals = await client.query(
      `SELECT id, email, hit_count, first_hit_at, last_hit_at FROM kostnadsfri_pixel_hits
        WHERE id = ANY($1::bigint[]) ORDER BY id`,
      [before.rows.map((row) => row.id)],
    );
    expect(originals.rows).toEqual(before.rows);

    const shape = await tableShape();
    expect(shape.constraints).toEqual(["kostnadsfri_pixel_hits_pkey"]);
    expect(shape.indexes).toEqual([
      "idx_kostnadsfri_pixel_hits_period",
      "idx_kostnadsfri_pixel_hits_recipient",
      "kostnadsfri_pixel_hits_pkey",
    ]);

    // The statement the app issues must now accept a second row for the same recipient.
    await client.query(
      `INSERT INTO kostnadsfri_pixel_hits (email, slug, kind, hit_at)
       VALUES ('b@example.test', 's1', 'animated', '2026-09-28T10:00:00Z'),
              ('b@example.test', 's1', 'animated', '2026-09-28T11:00:00Z')`,
    );
    const counted = await client.query<{ hits: number }>(
      `SELECT count(*)::int AS hits FROM kostnadsfri_pixel_hits
        WHERE email = 'b@example.test' AND hit_at > '2026-09-28T00:00:00Z'`,
    );
    expect(counted.rows[0].hits).toBe(2);
  });
});

describe.skipIf(!localUrl)("GET /api/kostnadsfri/pixel.gif mot riktig Postgres", () => {
  const runTag = randomUUID().replaceAll("-", "").slice(0, 12);
  const email = `pixel-${runTag}@example.test`;
  const slug = `pixel-contract-${runTag}`;
  const oldSlug = `pixel-contract-old-${runTag}`;
  const seed = `pixel-contract-seed-${runTag}`;

  let GET: typeof import("@/app/api/kostnadsfri/pixel.gif/route").GET;
  let createPixelToken: typeof import("@/lib/kostnadsfri/pixel-token").createPixelToken;
  let service: typeof import("@/lib/db/services/kostnadsfri");
  let appPool: typeof import("@/lib/db/client").pool;

  async function rowsFor(targetSlug: string) {
    const result = await appPool!.query<{ kind: string; hit_at: Date }>(
      "SELECT kind, hit_at FROM kostnadsfri_pixel_hits WHERE slug = $1 ORDER BY hit_at",
      [targetSlug],
    );
    return result.rows;
  }

  async function hit(token: string | null, kind: string) {
    const params = new URLSearchParams({ kind });
    if (token) params.set("token", token);
    const { NextRequest } = await import("next/server");
    const response = await GET(
      new NextRequest(`http://localhost/api/kostnadsfri/pixel.gif?${params.toString()}`),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/gif");
    expect(response.headers.get("cache-control")).toBe("no-store, private");
  }

  beforeAll(async () => {
    vi.stubEnv("POSTGRES_URL", localUrl!);
    vi.stubEnv("KOSTNADSFRI_PASSWORD_SEED", seed);
    ({ GET } = await import("@/app/api/kostnadsfri/pixel.gif/route"));
    ({ createPixelToken } = await import("@/lib/kostnadsfri/pixel-token"));
    service = await import("@/lib/db/services/kostnadsfri");
    ({ pool: appPool } = await import("@/lib/db/client"));

    const hitAt = await appPool!.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'kostnadsfri_pixel_hits' AND column_name = 'hit_at'`,
    );
    if (hitAt.rowCount !== 1) {
      throw new Error("kostnadsfri_pixel_hits saknar hit_at; kör migrationerna mot testdatabasen först.");
    }
  }, 60_000);

  afterAll(async () => {
    if (appPool) {
      await appPool
        .query("DELETE FROM kostnadsfri_pixel_hits WHERE slug = ANY($1::text[])", [[slug, oldSlug]])
        .catch(() => null);
      await appPool.end().catch(() => null);
    }
    vi.unstubAllEnvs();
  }, 60_000);

  it("stores a hit for a validly signed pixel", async () => {
    const token = createPixelToken({ email, slug, kind: "rent" });
    expect(token).toBeTruthy();

    await hit(token, "rent");

    const rows = await rowsFor(slug);
    expect(rows.map((row) => row.kind)).toEqual(["rent"]);
  });

  it("stores nothing when kind is swapped, the token is forged or missing", async () => {
    const rentToken = createPixelToken({ email, slug, kind: "rent" });
    const animatedToken = createPixelToken({ email, slug, kind: "animated" });

    await hit(rentToken, "animated");
    await hit(animatedToken, "rent");
    await hit(`${rentToken}x`, "rent");
    await hit(null, "rent");

    expect((await rowsFor(slug)).map((row) => row.kind)).toEqual(["rent"]);
  });

  it("debounces repeat hits for 30 minutes and counts the next one after that", async () => {
    const token = createPixelToken({ email, slug, kind: "rent" });
    await hit(token, "rent");
    const [first] = await rowsFor(slug);
    expect(await rowsFor(slug)).toHaveLength(1);

    const later = new Date(first.hit_at.getTime() + 31 * 60 * 1000);
    await expect(
      service.recordKostnadsfriPixelHit({ email, slug, kind: "rent", at: later }),
    ).resolves.toEqual({ counted: true });
    await expect(
      service.recordKostnadsfriPixelHit({
        email,
        slug,
        kind: "rent",
        at: new Date(later.getTime() + 10 * 60 * 1000),
      }),
    ).resolves.toEqual({ counted: false });

    expect(await rowsFor(slug)).toHaveLength(2);
  });

  it("counts hits inside the selected period only", async () => {
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await expect(
      service.recordKostnadsfriPixelHit({ email, slug: oldSlug, kind: "animated", at: fortyDaysAgo }),
    ).resolves.toEqual({ counted: true });

    const ours = (stats: Awaited<ReturnType<typeof service.getKostnadsfriPixelStats>>) =>
      stats.filter((entry) => entry.slug === slug || entry.slug === oldSlug);

    const month = ours(await service.getKostnadsfriPixelStats(30));
    expect(month).toHaveLength(1);
    expect(month[0]).toMatchObject({ slug, rent: { hits: 2 }, animated: { hits: 0 } });

    const quarter = ours(await service.getKostnadsfriPixelStats(90));
    expect(quarter.find((entry) => entry.slug === oldSlug)).toMatchObject({
      rent: { hits: 0 },
      animated: { hits: 1 },
    });
  });
});
