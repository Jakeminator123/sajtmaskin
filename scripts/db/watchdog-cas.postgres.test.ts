// @vitest-environment node
/**
 * Postgres-backad L5-test: stale-watchdogens fail-UPDATE måste CAS:a på
 * `verification_state` + `files_revision`. En mock kan bevisa att predikatet
 * formuleras; den kan inte bevisa att en promoverad eller omskriven rad
 * överlever UPDATE:n. Det här kontraktet failar mot dagens kod (id + no-lease
 * räcker för att skriva failed).
 *
 * Säkerhet: testet SKRIVER rader och vägrar allt utom en dev-target
 * (`check-db-env-target.mjs`). Fotavtrycket är EN `engine_chats`-rad; versioner
 * hänger i ON DELETE CASCADE.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { config as loadEnvFile } from "dotenv";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  checkDbEnvTarget,
  loadDbTargets,
  resolveConfiguredDbUrl,
} from "./check-db-env-target.mjs";
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
    `[watchdog-cas.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att kontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

const FILES_A = '[{"path":"app/page.tsx","content":"A"}]';
const FILES_B = '[{"path":"app/page.tsx","content":"B"}]';

describe.skipIf(!target.url)("watchdog CAS mot riktig Postgres (L5)", () => {
  const chatId = `chat_l5cas_${randomUUID()}`;
  let pool: Pool;
  let versionSeq = 0;
  let failVersionVerificationIfUnleased: typeof import("@/lib/db/chat-repository-pg").failVersionVerificationIfUnleased;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 3,
    });
    const repo = await import("@/lib/db/chat-repository-pg");
    failVersionVerificationIfUnleased = repo.failVersionVerificationIfUnleased;
    await pool.query("insert into engine_chats (id, title, model) values ($1, $2, $3)", [
      chatId,
      "watchdog-cas postgres-test",
      "test-model",
    ]);
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.query("delete from engine_chats where id = $1", [chatId]).catch(() => null);
    await pool.end().catch(() => null);
  }, 60_000);

  async function insertVerifying(filesJson: string): Promise<{
    id: string;
    filesRevision: string;
  }> {
    versionSeq += 1;
    const id = `ver_l5cas_${randomUUID()}`;
    await pool.query(
      `insert into engine_versions
         (id, chat_id, version_number, files_json, verification_state, release_state)
       values ($1, $2, $3, $4, 'verifying', 'draft')`,
      [id, chatId, versionSeq, filesJson],
    );
    const row = await pool.query<{ files_revision: string }>(
      "select files_revision from engine_versions where id = $1",
      [id],
    );
    return { id, filesRevision: row.rows[0].files_revision };
  }

  async function readState(id: string) {
    const row = await pool.query<{
      verification_state: string;
      release_state: string;
      files_revision: string;
    }>(
      "select verification_state, release_state, files_revision from engine_versions where id = $1",
      [id],
    );
    return row.rows[0];
  }

  it("a) promoverad rad under await skrivs inte till failed", async () => {
    const { id, filesRevision } = await insertVerifying(FILES_A);
    await pool.query(
      `update engine_versions
          set verification_state = 'passed', release_state = 'promoted', promoted_at = now()
        where id = $1`,
      [id],
    );

    const result = await failVersionVerificationIfUnleased(id, "stale timeout", {
      verificationState: "verifying",
      filesRevision,
    });

    expect(result).toEqual({ applied: false, reason: "cas_miss" });
    const after = await readState(id);
    expect(after.verification_state).toBe("passed");
    expect(after.release_state).toBe("promoted");
  });

  it("b) revision B under await är en no-op", async () => {
    const { id, filesRevision } = await insertVerifying(FILES_A);
    await pool.query("update engine_versions set files_json = $1 where id = $2", [FILES_B, id]);
    const afterRewrite = await readState(id);
    expect(afterRewrite.files_revision).not.toBe(filesRevision);

    const result = await failVersionVerificationIfUnleased(id, "stale timeout", {
      verificationState: "verifying",
      filesRevision,
    });

    expect(result).toEqual({ applied: false, reason: "cas_miss" });
    const after = await readState(id);
    expect(after.verification_state).toBe("verifying");
    expect(after.release_state).toBe("draft");
    expect(after.files_revision).toBe(afterRewrite.files_revision);
  });

  it("c) förväntad NULL-revision matchar bara NULL (hashed rad = cas_miss)", async () => {
    const { id, filesRevision } = await insertVerifying(FILES_A);
    expect(filesRevision).toBeTruthy();

    const result = await failVersionVerificationIfUnleased(id, "stale timeout", {
      verificationState: "verifying",
      filesRevision: null,
    });

    expect(result).toEqual({ applied: false, reason: "cas_miss" });
    const after = await readState(id);
    expect(after.verification_state).toBe("verifying");
  });

  it("d) timeout utan konkurrens skriver failed som förut", async () => {
    const { id, filesRevision } = await insertVerifying(FILES_A);

    const result = await failVersionVerificationIfUnleased(id, "stale timeout", {
      verificationState: "verifying",
      filesRevision,
    });

    expect(result?.applied).toBe(true);
    if (result?.applied) {
      expect(result.version.verification_state).toBe("failed");
    }
    const after = await readState(id);
    expect(after.verification_state).toBe("failed");
    expect(after.release_state).toBe("draft");
  });
});
