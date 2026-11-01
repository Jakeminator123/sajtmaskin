// @vitest-environment node
/** Real two-connection concurrency contract. Only unique disposable DEV rows
 * are inserted; no DDL, migrations, mail, production or existing users. */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { config } from "dotenv";
import { Client, Pool, type ClientConfig } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { checkDbEnvTarget, loadDbTargets, resolveConfiguredDbUrl } from "./check-db-env-target.mjs";
import * as schema from "../../src/lib/db/schema";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return state.db;
  },
  dbConfigured: true,
}));
vi.mock("@/lib/auth/auth", () => ({ hashPassword: vi.fn() }));
// Retention scope has its own tests. This contract isolates create/claim/delete locking.
vi.mock("@/lib/db/billing-retention-guard", () => ({
  assertNoProtectedBillingRows: vi.fn(async () => undefined),
}));

if (existsSync(".env.local")) config({ path: ".env.local", override: false, quiet: true });
const resolved = resolveConfiguredDbUrl(process.env);
const verdict =
  resolved &&
  checkDbEnvTarget({ expect: "dev", urlValue: resolved.value, targets: loadDbTargets() });
const target = verdict?.ok ? resolved?.value : null;
if (!target && process.env.REQUIRE_POSTGRES_TESTS === "1")
  throw new Error(
    "Owner-lock tests require a verified DEV/local Postgres target; PROD is refused.",
  );

describe.skipIf(!target)("project ownership vs account deletion — real Postgres", () => {
  let actor: Client;
  let pool: Pool;
  let actorPid: number;
  let workerPid: number;
  let transactionOpen = false;
  let projects: typeof import("../../src/lib/db/services/projects");
  let admin: typeof import("../../src/lib/db/services/admin-users");
  let campaign: typeof import("../../src/lib/db/services/kostnadsfri-account");
  let campaignProvider: string;
  let tag: string;
  let userId: string;
  let campaignId: string;
  const pending: Promise<unknown>[] = [];

  beforeAll(async () => {
    const url = new URL(target!);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.hostname.endsWith(".pooler.supabase.com")) url.port = "5432";
    for (const key of ["sslmode", "sslrootcert", "sslcert", "sslkey", "supa"])
      url.searchParams.delete(key);
    let ssl: ClientConfig["ssl"] = false;
    if (!local) {
      const response = await fetch(
        "https://supabase-downloads.s3.amazonaws.com/prod/ssl/prod-ca-2021.crt",
        { signal: AbortSignal.timeout(10000) },
      );
      const ca = await response.text();
      if (!response.ok || !ca.includes("BEGIN CERTIFICATE"))
        throw new Error("Public DB CA unavailable");
      ssl = { ca, rejectUnauthorized: true };
    }
    const connection = {
      connectionString: url.toString(),
      ssl,
      connectionTimeoutMillis: 10000,
      statement_timeout: 10000,
    };
    actor = new Client(connection);
    pool = new Pool({ ...connection, max: 1 });
    await actor.connect();
    actorPid = (await actor.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    workerPid = (await pool.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
    state.db = drizzle(pool, { schema });
    projects = await import("../../src/lib/db/services/projects");
    admin = await import("../../src/lib/db/services/admin-users");
    campaign = await import("../../src/lib/db/services/kostnadsfri-account");
    campaignProvider = (await import("../../src/lib/kostnadsfri/campaign-account"))
      .KOSTNADSFRI_CAMPAIGN_PROVIDER;
  }, 30000);

  beforeEach(async () => {
    tag = `owner_lock_${randomUUID()}`;
    userId = `${tag}_user`;
    campaignId = `${tag}_campaign`;
    pending.length = 0;
    await actor.query(
      "INSERT INTO users (id,email,provider,diamonds,free_generation_available,email_verified) VALUES ($1,$2,'email',0,false,false)",
      [userId, `${userId}@example.invalid`],
    );
  });

  afterEach(async () => {
    if (transactionOpen) {
      await actor.query("ROLLBACK");
      transactionOpen = false;
    }
    await Promise.allSettled(pending);
    await actor.query("DELETE FROM app_projects WHERE session_id=$1", [tag]);
    await actor.query("DELETE FROM users WHERE id=ANY($1::text[])", [[userId, campaignId]]);
  });
  afterAll(async () => {
    await pool?.end();
    await actor?.end();
  });

  function track<T>(promise: Promise<T>) {
    pending.push(promise);
    void promise.catch(() => undefined);
    return promise;
  }

  async function waitForRowLock() {
    const until = Date.now() + 4000;
    while (Date.now() < until) {
      const row = (
        await actor.query("SELECT $1::int=ANY(pg_blocking_pids($2::int)) AS blocked", [
          actorPid,
          workerPid,
        ])
      ).rows[0];
      if (row.blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error("The worker did not wait on the account row lock");
  }

  async function deleteWhileLocked() {
    await actor.query("BEGIN");
    transactionOpen = true;
    await actor.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    await actor.query("DELETE FROM users WHERE id=$1", [userId]);
  }
  async function release() {
    await actor.query("COMMIT");
    transactionOpen = false;
  }

  it("rejects a waiting create after deletion commits instead of inserting a stale owner", async () => {
    await deleteWhileLocked();
    const write = track(projects.createProject("Lock test", undefined, undefined, tag, userId));
    await waitForRowLock();
    await release();
    await expect(write).rejects.toThrow("owner account no longer exists");
    expect(
      (await actor.query("SELECT id FROM app_projects WHERE session_id=$1", [tag])).rowCount,
    ).toBe(0);
  }, 15000);

  it.each(["session", "single"] as const)(
    "rejects a waiting %s claim after deletion commits",
    async (kind) => {
      const id = randomUUID();
      await actor.query(
        "INSERT INTO app_projects (id,name,session_id) VALUES ($1,'Guest lock test',$2)",
        [id, tag],
      );
      await deleteWhileLocked();
      const write = track<unknown>(
        kind === "session"
          ? projects.claimUnclaimedSessionProjects(tag, userId)
          : projects.getProjectByIdForOwner(id, { userId, sessionId: tag }),
      );
      await waitForRowLock();
      await release();
      await expect(write).rejects.toThrow("owner account no longer exists");
      expect(
        (await actor.query("SELECT user_id FROM app_projects WHERE id=$1", [id])).rows[0].user_id,
      ).toBeNull();
    },
    15000,
  );

  it("preserves the account if a writer already holds KEY SHARE and creates a project", async () => {
    await actor.query("BEGIN");
    transactionOpen = true;
    await actor.query("SELECT id FROM users WHERE id=$1 FOR KEY SHARE", [userId]);
    const deletion = track(
      admin.deleteAdminUser({ userId, confirmEmail: `${userId}@example.invalid` }, "test-operator"),
    );
    await waitForRowLock();
    await actor.query(
      "INSERT INTO app_projects (id,name,session_id,user_id) VALUES ($1,'Writer won',$2,$3)",
      [randomUUID(), tag, userId],
    );
    await release();
    await expect(deletion).rejects.toThrow("Kontot har projekt");
    expect((await actor.query("SELECT id FROM users WHERE id=$1", [userId])).rowCount).toBe(1);
  }, 15000);

  it("does not transfer campaign projects to a target account deleted while waiting", async () => {
    await actor.query(
      "INSERT INTO users (id,email,provider,diamonds,free_generation_available,email_verified) VALUES ($1,$2,$3,0,false,false)",
      [campaignId, `${campaignId}@example.invalid`, campaignProvider],
    );
    const id = randomUUID();
    await actor.query(
      "INSERT INTO app_projects (id,name,session_id,user_id) VALUES ($1,'Campaign lock test',$2,$3)",
      [id, tag, campaignId],
    );
    await deleteWhileLocked();
    const transfer = track(
      campaign.transferKostnadsfriCampaignAccount({
        campaignUserId: campaignId,
        targetUserId: userId,
      }),
    );
    await waitForRowLock();
    await release();
    await expect(transfer).rejects.toThrow("owner account no longer exists");
    expect(
      (await actor.query("SELECT user_id FROM app_projects WHERE id=$1", [id])).rows[0].user_id,
    ).toBe(campaignId);
  }, 15000);
});
