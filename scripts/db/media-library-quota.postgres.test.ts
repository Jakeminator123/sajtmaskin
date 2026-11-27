// @vitest-environment node
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "../../src/lib/db/schema";
import { checkDbEnvTarget, loadDbTargets, resolveConfiguredDbUrl } from "./check-db-env-target.mjs";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/client", () => ({
  get db() { return state.db; },
  dbConfigured: true,
}));

const configured = resolveConfiguredDbUrl(process.env);
const target = configured && checkDbEnvTarget({
  expect: "dev", urlValue: configured.value, targets: loadDbTargets(),
}).ok && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(configured.value).hostname)
  ? configured.value : null;

if (!target && process.env.REQUIRE_POSTGRES_TESTS === "1") {
  throw new Error("Media quota concurrency requires isolated localhost Postgres.");
}

describe.skipIf(!target)("media library cap in real local Postgres", () => {
  const tag = `media-test-${randomUUID()}`;
  const owner = `${tag}-owner`;
  const otherOwner = `${tag}-other`;
  const siteA = `${tag}-site-a`;
  const siteB = `${tag}-site-b`;
  const foreignSite = `${tag}-foreign`;
  let pool: Pool;
  let media: typeof import("../../src/lib/db/services/media");

  beforeAll(async () => {
    pool = new Pool({ connectionString: target!, max: 4, statement_timeout: 8_000, connectionTimeoutMillis: 5_000 });
    state.db = drizzle(pool, { schema });
    media = await import("../../src/lib/db/services/media");
    await pool.query(
      "insert into app_projects (id, user_id, name) values ($1, $2, 'Test A'), ($3, $2, 'Test B'), ($4, $5, 'Foreign test')",
      [siteA, owner, siteB, foreignSite, otherOwner],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      await pool.query("delete from media_library where user_id = any($1::text[])", [[owner, otherOwner]]);
      await pool.query("delete from app_projects where id = any($1::text[])", [[siteA, siteB, foreignSite]]);
    } finally {
      await pool.end();
    }
  });

  function seed(userId: string, projectId: string | null, fileType: string, count: number) {
    return pool.query(`
      insert into media_library
        (user_id, project_id, file_type, mime_type, filename, original_name, file_path, size_bytes)
      select $1, $2, $3, 'image/png', 'test.png', 'test.png', $1 || '/' || $3 || '/' || series, 1
      from generate_series(1, $4::int) as seed(series)
    `, [userId, projectId, fileType, count]);
  }

  function save(name: string, projectId: string) {
    return media.saveMediaLibraryItem(owner, name, name, `${tag}/${name}`, "image/png", 1, "", projectId);
  }

  it("lets only one of two transactions claim the final slot and leaves the other buckets independent", async () => {
    await seed(owner, siteA, "image", 198);
    await seed(owner, siteA, "logo", 1);
    await seed(owner, null, "image", 200);
    await seed(otherOwner, siteA, "image", 20);
    await pool.query(
      "insert into images (project_id, filename, file_path) select project_id, filename, file_path from media_library where user_id = $1 and project_id = $2 limit 1",
      [owner, siteA],
    );

    expect((await media.getMediaLibraryCounts(owner, siteA)).images).toBe(199);
    expect((await media.getMediaLibraryCounts(owner)).images).toBe(200);
    await expect(save("foreign.png", foreignSite)).rejects.toMatchObject({ status: 404 });

    const gate = await pool.connect();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await gate.query("begin");
      await gate.query("select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [JSON.stringify(["media-images", owner, siteA])]);
      pending = Promise.allSettled([
        save("left.png", siteA),
        media.saveImage(owner, siteA, "right.png", `${tag}/right.png`, "right.png", "image/png", 1),
      ]);

      let waiting = 0;
      const deadline = Date.now() + 4_000;
      do {
        const { rows } = await gate.query<{ waiting: number }>(`
          select count(*)::int as waiting from pg_locks pending
          join pg_locks held using (database, classid, objid, objsubid)
          where held.pid = pg_backend_pid() and held.granted and held.locktype = 'advisory'
            and pending.locktype = 'advisory' and not pending.granted
        `);
        waiting = rows[0].waiting;
        if (waiting < 2) await new Promise((resolve) => setTimeout(resolve, 25));
      } while (waiting < 2 && Date.now() < deadline);
      expect(waiting).toBe(2);
    } finally {
      try {
        await gate.query("rollback");
      } finally {
        gate.release();
        await pending;
      }
    }

    const outcomes = await pending!;
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: { status: 400 } });
    expect((await media.getMediaLibraryCounts(owner, siteA)).images).toBe(200);
    expect((await media.getMediaLibraryCounts(otherOwner, siteA)).images).toBe(20);
    await expect(save("separate.png", siteB)).resolves.toMatchObject({ project_id: siteB });
  }, 20_000);
});
