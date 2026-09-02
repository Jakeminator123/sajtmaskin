// @vitest-environment node
/**
 * Postgres-backad test för L4: två samtidiga `acquireVersionLease` mot samma
 * version ger exakt en ägare. Det partiella unika indexet + ON CONFLICT-vägen
 * kan inte emuleras rättvist av en mock, så kontraktet körs mot riktig Postgres.
 *
 * Säkerhet: testet SKRIVER rader och vägrar allt utom en dev-target
 * (`check-db-env-target.mjs`). Fotavtrycket är EN `engine_chats`-rad; version
 * och jobs hänger i ON DELETE CASCADE.
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
    `[version-lease.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att kontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

describe.skipIf(!target.url)("version-lease-ägande mot riktig Postgres (L4)", () => {
  const chatId = `chat_leasetest_${randomUUID()}`;
  const versionId = `ver_leasetest_${randomUUID()}`;

  let pool: Pool;
  let acquireVersionLease: typeof import("@/lib/db/chat-repository-pg").acquireVersionLease;
  let releaseVersionLease: typeof import("@/lib/db/chat-repository-pg").releaseVersionLease;
  let leaseTableExists: typeof import("@/lib/db/chat-repository-pg").leaseTableExists;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 4,
    });

    const repo = await import("@/lib/db/chat-repository-pg");
    acquireVersionLease = repo.acquireVersionLease;
    releaseVersionLease = repo.releaseVersionLease;
    leaseTableExists = repo.leaseTableExists;

    await pool.query("insert into engine_chats (id, title, model) values ($1, $2, $3)", [
      chatId,
      "version-lease postgres-test",
      "test-model",
    ]);
    await pool.query(
      `insert into engine_versions (id, chat_id, version_number, files_json)
       values ($1, $2, $3, $4)`,
      [versionId, chatId, 1, '[{"path":"app/page.tsx","content":"x"}]'],
    );
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.query("delete from engine_chats where id = $1", [chatId]).catch(() => null);
    await pool.end().catch(() => null);
  }, 60_000);

  it("leaseTableExists är exists på en migrerad dev-databas", async () => {
    expect(await leaseTableExists()).toBe("exists");
  });

  it("två samtidiga acquire mot samma version ger exakt en ägare", async () => {
    const [a, b] = await Promise.all([
      acquireVersionLease(versionId, "server_verify"),
      acquireVersionLease(versionId, "manual_repair"),
    ]);
    const winners = [a, b].filter((lease): lease is { runId: string } => lease != null);
    expect(winners).toHaveLength(1);
    expect(winners[0].runId.length).toBeGreaterThan(0);
    expect([a, b].filter((lease) => lease == null)).toHaveLength(1);

    const third = await acquireVersionLease(versionId, "quick_edit");
    expect(third).toBeNull();

    await releaseVersionLease(versionId, winners[0].runId);
    const afterRelease = await acquireVersionLease(versionId, "quick_edit");
    expect(afterRelease?.runId).toBeTruthy();
    if (afterRelease) {
      await releaseVersionLease(versionId, afterRelease.runId);
    }
  });
});
