// @vitest-environment node
/**
 * Postgres-backad test för `selected_dossier_env_keys`-kontraktet
 * (bug-swarm 2026-08-01: "Dossier-env rehydreras inte vid force-restart eller
 * quick-edit-fallback").
 *
 * Varför den finns bredvid de mockade systertesterna (preview-session-routen
 * och quick-edit-servicen): de bevisar att läsarna TRÅDAR kolumnen vidare till
 * `startPreviewSession`, men kan per konstruktion inte bevisa att migrationen
 * (`src/lib/db/migrations/add-engine-version-selected-dossier-env-keys.sql`)
 * faktiskt ger kolumnen, att `insertDraftVersionRow`s text→jsonb-cast landar
 * som en riktig jsonb-array, eller att en rad utan nycklar förblir NULL.
 * Kontraktet är DB-runtime-beteende — samma motivering som
 * `files-revision-contract.postgres.test.ts`, vars mönster den här filen
 * följer (placering, dev-target-vägran, cascade-städning).
 *
 * Säkerhet: testet SKRIVER rader, så det vägrar allt utom en dev-target via
 * repots egen `check-db-env-target.mjs`. Fotavtrycket är EN `engine_chats`-rad;
 * versionerna hänger i `ON DELETE CASCADE` och städas med en enda DELETE.
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

// Vitest laddar inte `.env.local`. `override: false` gör att en explicit
// injicerad `POSTGRES_URL` (CI) alltid vinner över filen.
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

// Samma false-green-grind som systerfilerna: i CI (REQUIRE_POSTGRES_TESTS=1)
// får en saknad databas inte bli ett tyst hopp.
const requireDb = process.env.REQUIRE_POSTGRES_TESTS?.trim() === "1";

if (!target.url) {
  const message =
    `[selected-dossier-env-keys.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel.`,
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

describe.skipIf(!target.url)(
  "selected_dossier_env_keys-kontraktet mot riktig Postgres",
  () => {
    const chatId = `chat_sdek_${randomUUID()}`;
    const versionWithKeysId = `ver_sdek_keys_${randomUUID()}`;
    const versionWithoutKeysId = `ver_sdek_null_${randomUUID()}`;
    const envKeys = ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "EMAIL_FROM"];
    const filesJson = JSON.stringify({ "app/page.tsx": "export default () => null;" });

    let pool: Pool;

    beforeAll(async () => {
      pool = new Pool({
        connectionString: target.url!,
        ssl: resolveSslConfig(target.url!),
        max: 2,
      });

      await pool.query("insert into engine_chats (id, title, model) values ($1, $2, $3)", [
        chatId,
        "selected_dossier_env_keys postgres-test",
        "test-model",
      ]);
      // Samma parameterform som insertDraftVersionRow: JSON.stringify:ad
      // text-param castad till jsonb, respektive NULL när inga nycklar finns.
      await pool.query(
        `insert into engine_versions (id, chat_id, version_number, files_json, selected_dossier_env_keys)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [versionWithKeysId, chatId, 1, filesJson, JSON.stringify(envKeys)],
      );
      await pool.query(
        `insert into engine_versions (id, chat_id, version_number, files_json, selected_dossier_env_keys)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [versionWithoutKeysId, chatId, 2, filesJson, null],
      );
    }, 60_000);

    afterAll(async () => {
      if (!pool) return;
      await pool.query("delete from engine_chats where id = $1", [chatId]).catch(() => null);
      await pool.end().catch(() => null);
    }, 60_000);

    it("kolumnen finns, är jsonb och nullbar (migrationen är applicerad)", async () => {
      const res = await pool.query<{ data_type: string; is_nullable: string }>(
        `select data_type, is_nullable
           from information_schema.columns
          where table_name = 'engine_versions'
            and column_name = 'selected_dossier_env_keys'`,
      );
      expect(res.rowCount).toBe(1);
      expect(res.rows[0].data_type).toBe("jsonb");
      expect(res.rows[0].is_nullable).toBe("YES");
    });

    it("round-trippar insert-formens text→jsonb-cast som en riktig strängarray", async () => {
      const res = await pool.query<{ selected_dossier_env_keys: string[] | null }>(
        "select selected_dossier_env_keys from engine_versions where id = $1",
        [versionWithKeysId],
      );
      // pg deserialiserar jsonb till JS-värdet — exakt det Version-typen lovar.
      expect(res.rows[0].selected_dossier_env_keys).toEqual(envKeys);
    });

    it("NULL betyder 'inga dossier-nycklar' och förblir NULL", async () => {
      const res = await pool.query<{ selected_dossier_env_keys: string[] | null }>(
        "select selected_dossier_env_keys from engine_versions where id = $1",
        [versionWithoutKeysId],
      );
      expect(res.rows[0].selected_dossier_env_keys).toBeNull();
    });
  },
);
