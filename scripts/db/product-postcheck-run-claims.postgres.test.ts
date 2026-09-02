// @vitest-environment node
/**
 * Postgres-backat kontrakt för L6 Product Postcheck single-flight.
 *
 * Enhetstesterna mockar `db.execute`. Den här filen bevisar att UNIQUE-
 * claim-nyckeln, ON CONFLICT DO NOTHING, expiry-takeover och CAS på
 * (run_id, claim_generation) håller i riktig Postgres — inklusive två
 * samtidiga INSERT mot samma tupel.
 *
 * Skriver rader; vägrar allt utom en dev-target via check-db-env-target.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { config as loadEnvFile } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

const target = resolveDevDbUrl();
const requireDb = process.env.REQUIRE_POSTGRES_TESTS?.trim() === "1";

if (!target.url) {
  const message =
    `[product-postcheck-claims.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel.`,
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

describe.skipIf(!target.url)("product_postcheck_runs mot riktig Postgres", () => {
  const runTag = randomUUID();
  const chatId = `chat_ppr_${runTag}`;
  let pool: Pool;
  let claims: typeof import("../../src/lib/db/services/product-postcheck-runs");

  function key(suffix: string) {
    return {
      versionId: `ver_${suffix}_${runTag}`,
      filesRevision: `rev_${suffix}`,
      previewSession: `ps_${suffix}`,
      lifecycleToken: `life_${suffix}`,
      mutationRevision: 3,
    };
  }

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 4,
    });
    const present = await pool.query<{ oid: string | null }>(
      "select to_regclass('public.product_postcheck_runs') as oid",
    );
    if (present.rows[0]?.oid == null) {
      throw new Error(
        "product_postcheck_runs saknas — kör npm run db:migrate mot dev först.",
      );
    }
    await pool.query("insert into engine_chats (id, title, model) values ($1, $2, $3)", [
      chatId,
      "product_postcheck_runs postgres-test",
      "test-model",
    ]);
    claims = await import("../../src/lib/db/services/product-postcheck-runs");
  });

  afterAll(async () => {
    await pool.query("delete from engine_chats where id = $1", [chatId]).catch(() => undefined);
    await pool?.end();
  });

  it("(a) två samtidiga claim → en acquired, en busy, en running-rad", async () => {
    const claimKey = key("a");
    const [first, second] = await Promise.all([
      claims.claimProductPostcheckRun({ chatId, owner: "owner_a", key: claimKey }),
      claims.claimProductPostcheckRun({ chatId, owner: "owner_b", key: claimKey }),
    ]);
    const kinds = [first.kind, second.kind].sort();
    expect(kinds).toEqual(["acquired", "busy"]);
    const acquired = first.kind === "acquired" ? first : second;
    const busy = first.kind === "busy" ? first : second;
    if (acquired.kind !== "acquired" || busy.kind !== "busy") {
      throw new Error("förväntade acquired + busy");
    }
    expect(busy.runId).toBe(acquired.runId);
    const { rows } = await pool.query<{ n: string; status: string }>(
      `select count(*)::text as n, min(status) as status
         from product_postcheck_runs
        where version_id = $1 and files_revision = $2
          and preview_session = $3 and lifecycle_token = $4
          and mutation_revision = $5`,
      [
        claimKey.versionId,
        claimKey.filesRevision,
        claimKey.previewSession,
        claimKey.lifecycleToken,
        claimKey.mutationRevision,
      ],
    );
    expect(rows[0]?.n).toBe("1");
    expect(rows[0]?.status).toBe("running");
  });

  it("(b) DB-fel vid claim (FK) → unavailable, ingen rad", async () => {
    const claimKey = key("b");
    const claim = await claims.claimProductPostcheckRun({
      chatId: `chat_missing_${runTag}`,
      owner: "owner_b",
      key: claimKey,
    });
    expect(claim).toEqual({ kind: "unavailable", reason: "db_error" });
    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text as n from product_postcheck_runs
        where version_id = $1`,
      [claimKey.versionId],
    );
    expect(rows[0]?.n).toBe("0");
  });

  it("(c) takeover före expiry avvisas", async () => {
    const claimKey = key("c");
    const first = await claims.claimProductPostcheckRun({
      chatId,
      owner: "owner_c",
      key: claimKey,
    });
    expect(first.kind).toBe("acquired");
    const second = await claims.claimProductPostcheckRun({
      chatId,
      owner: "intruder_c",
      key: claimKey,
    });
    expect(second).toMatchObject({
      kind: "busy",
      runId: first.kind === "acquired" ? first.runId : "missing",
      claimGeneration: 1,
    });
    const { rows } = await pool.query<{ claim_generation: number; owner: string }>(
      `select claim_generation, owner from product_postcheck_runs
        where version_id = $1`,
      [claimKey.versionId],
    );
    expect(rows[0]?.claim_generation).toBe(1);
    expect(rows[0]?.owner).toBe("owner_c");
  });

  it("(d)(e)(f) takeover efter expiry bumpar generation; gammal CAS no-op; ny skriver", async () => {
    const claimKey = key("def");
    const first = await claims.claimProductPostcheckRun({
      chatId,
      owner: "owner_old",
      key: claimKey,
    });
    expect(first.kind).toBe("acquired");
    if (first.kind !== "acquired") throw new Error("expected acquire");

    await pool.query(
      `update product_postcheck_runs
          set expires_at = now() - interval '1 second'
        where run_id = $1`,
      [first.runId],
    );

    const takeover = await claims.claimProductPostcheckRun({
      chatId,
      owner: "owner_new",
      key: claimKey,
    });
    expect(takeover.kind).toBe("acquired");
    if (takeover.kind !== "acquired") throw new Error("expected takeover");
    expect(takeover.claimGeneration).toBe(2);
    expect(takeover.runId).not.toBe(first.runId);
    expect(takeover.owner).toBe("owner_new");

    const staleWrite = await claims.completeProductPostcheckRun({
      runId: first.runId,
      claimGeneration: first.claimGeneration,
      status: "passed",
    });
    expect(staleWrite).toBe(false);
    const afterStale = await pool.query<{ status: string; run_id: string }>(
      `select status, run_id from product_postcheck_runs where version_id = $1`,
      [claimKey.versionId],
    );
    expect(afterStale.rows[0]?.status).toBe("running");
    expect(afterStale.rows[0]?.run_id).toBe(takeover.runId);

    const freshWrite = await claims.completeProductPostcheckRun({
      runId: takeover.runId,
      claimGeneration: takeover.claimGeneration,
      status: "passed",
    });
    expect(freshWrite).toBe(true);
    const afterFresh = await pool.query<{
      status: string;
      claim_generation: number;
      completed_at: Date | null;
    }>(
      `select status, claim_generation, completed_at
         from product_postcheck_runs where version_id = $1`,
      [claimKey.versionId],
    );
    expect(afterFresh.rows[0]?.status).toBe("passed");
    expect(afterFresh.rows[0]?.claim_generation).toBe(2);
    expect(afterFresh.rows[0]?.completed_at).toBeInstanceOf(Date);

    const afterPassed = await claims.claimProductPostcheckRun({
      chatId,
      owner: "resume_after_pass",
      key: claimKey,
    });
    expect(afterPassed).toMatchObject({
      kind: "settled",
      status: "passed",
      runId: takeover.runId,
      claimGeneration: 2,
    });
    const stillPassed = await pool.query<{
      status: string;
      claim_generation: number;
      run_id: string;
    }>(
      `select status, claim_generation, run_id
         from product_postcheck_runs where version_id = $1`,
      [claimKey.versionId],
    );
    expect(stillPassed.rows[0]?.status).toBe("passed");
    expect(stillPassed.rows[0]?.claim_generation).toBe(2);
    expect(stillPassed.rows[0]?.run_id).toBe(takeover.runId);
  });

  it("UNIQUE-nyckeln inkluderar mutation_revision — annan mutation är ny claim", async () => {
    const base = key("mut");
    const first = await claims.claimProductPostcheckRun({
      chatId,
      owner: "owner_m1",
      key: base,
    });
    const second = await claims.claimProductPostcheckRun({
      chatId,
      owner: "owner_m2",
      key: { ...base, mutationRevision: 4 },
    });
    expect(first.kind).toBe("acquired");
    expect(second.kind).toBe("acquired");
    if (first.kind === "acquired" && second.kind === "acquired") {
      expect(first.runId).not.toBe(second.runId);
    }
  });
});
