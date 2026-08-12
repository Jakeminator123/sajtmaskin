// @vitest-environment node
/**
 * Postgres-backad test för `files_revision`-kontraktet (stänger P1 i
 * BUG-SWARM-BACKLOG).
 *
 * Varför den finns bredvid den mockade systertesten
 * (`src/lib/db/services/generation-telemetry.files-revision.test.ts`): den
 * bevisar att Drizzle *formulerar* en subselect. Den kan per konstruktion inte
 * bevisa att den genererade kolumnen finns, att Postgres räknar om den när
 * `files_json` skrivs om, eller att telemetrin lagrar rätt hex-hash. Kontraktet
 * är DB-genererat runtime-beteende, så en ogiltig eller oapplicerad migration
 * hade inte fällt någonting. Prod-observationen "141/141 versioner har revision"
 * är ett kvitto, inte en grind.
 *
 * Varför filen bor här och inte i `src/`: det som testas är migrationen
 * (`src/lib/db/migrations/add-files-revision.sql`) applicerad av
 * `scripts/db/db-init.mjs`, och DB-kontraktstesterna bor redan i den här mappen
 * (`timezone-contract.test.ts` är den statiska syskonvarianten,
 * `migration-ledger.test.ts` den andra). Här är `.mjs`-importer dessutom det
 * etablerade mönstret — ingen `src/`-fil importerar körbar kod ur `scripts/`.
 *
 * Säkerhet: testet SKRIVER rader, så det vägrar allt utom en dev-target.
 * Identitetskontrollen är repots egen (`check-db-env-target.mjs`), som godtar
 * dev-Supabase och en lokal/tillfällig Postgres men avvisar prod-projektet.
 * Fotavtrycket är EN `engine_chats`-rad; version och telemetri hänger i
 * `ON DELETE CASCADE` och städas med en enda DELETE i `afterAll`.
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

/**
 * I CI ska ett hopp INTE vara tillåtet.
 *
 * Vitest avslutar med 0 för skippade tester, så om databasen försvinner i CI
 * (misslyckad `db:init`, ändrad URL, borttagen service-container) skulle den här
 * filen rapportera "7 skipped" och grinden bli grön utan att ha bevisat något.
 * Det är exakt den false-green-klass filen finns för att stänga — så när
 * `REQUIRE_POSTGRES_TESTS` är satt kastar den i stället.
 *
 * Lokalt är hoppet däremot rätt: en utvecklare utan `.env.local` ska inte få ett
 * rött test för en databas hen inte har.
 */
const requireDb = process.env.REQUIRE_POSTGRES_TESTS?.trim() === "1";

if (!target.url) {
  const message =
    `[files-revision.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    // Kastar vid collection → filen rapporteras som FAILED, inte skipped.
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att kontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

describe.skipIf(!target.url)("files_revision-kontraktet mot riktig Postgres", () => {
  const chatId = `chat_frtest_${randomUUID()}`;
  const versionId = `ver_frtest_${randomUUID()}`;
  const filesA = JSON.stringify({ "app/page.tsx": "export default () => null;" });
  const filesB = JSON.stringify({ "app/page.tsx": "export default () => 'two';" });

  let pool: Pool;
  /** md5 räknat av Postgres, inte av oss — vi jämför mot databasens egen sanning. */
  let md5OfA = "";
  let md5OfB = "";

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 2,
    });

    const hashes = await pool.query<{ a: string; b: string }>(
      "select md5($1::text) as a, md5($2::text) as b",
      [filesA, filesB],
    );
    md5OfA = hashes.rows[0].a;
    md5OfB = hashes.rows[0].b;

    await pool.query("insert into engine_chats (id, title, model) values ($1, $2, $3)", [
      chatId,
      "files_revision postgres-test",
      "test-model",
    ]);
    await pool.query(
      `insert into engine_versions (id, chat_id, version_number, files_json)
       values ($1, $2, $3, $4)`,
      [versionId, chatId, 1, filesA],
    );
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.query("delete from engine_chats where id = $1", [chatId]).catch(() => null);
    await pool.end().catch(() => null);
  }, 60_000);

  /**
   * Skriver en telemetrirad med SAMMA subselect-form som `resolveFilesRevision()`
   * bygger för versionId-vägen. `model` är NOT NULL i schemat — det upptäcktes av
   * just den här testen, vilket är precis vad en mock inte kan göra.
   */
  async function insertTelemetryWithVersionRevision(telemetryId: string): Promise<void> {
    await pool.query(
      `insert into generation_telemetry (id, chat_id, model, version_id, files_revision)
       values ($1, $2, $3, $4, (select files_revision from engine_versions where id = $4))`,
      [telemetryId, chatId, "test-model", versionId],
    );
  }

  it("kolumnen finns och är GENERATED ... STORED, inte en vanlig text-kolumn", async () => {
    const res = await pool.query<{
      is_generated: string;
      generation_expression: string | null;
    }>(
      `select is_generated, generation_expression
         from information_schema.columns
        where table_name = 'engine_versions' and column_name = 'files_revision'`,
    );

    expect(res.rowCount).toBe(1);
    expect(res.rows[0].is_generated).toBe("ALWAYS");
    // Uttrycket är det som gör kolumnen oglömbar — utan det kan en skrivare missa den.
    expect(res.rows[0].generation_expression).toMatch(/md5/i);
  });

  it("stämplas vid INSERT utan att någon skrivare rör fältet", async () => {
    const res = await pool.query<{ files_revision: string | null }>(
      "select files_revision from engine_versions where id = $1",
      [versionId],
    );
    expect(res.rows[0].files_revision).toBe(md5OfA);
  });

  it("räknas OM när files_json skrivs om — hela poängen med primitiven", async () => {
    await pool.query("update engine_versions set files_json = $1 where id = $2", [
      filesB,
      versionId,
    ]);

    const after = await pool.query<{ files_revision: string | null }>(
      "select files_revision from engine_versions where id = $1",
      [versionId],
    );
    expect(after.rows[0].files_revision).toBe(md5OfB);
    expect(after.rows[0].files_revision).not.toBe(md5OfA);

    // Återställ basen så efterföljande test ser det de förväntar.
    await pool.query("update engine_versions set files_json = $1 where id = $2", [
      filesA,
      versionId,
    ]);
    const restored = await pool.query<{ files_revision: string | null }>(
      "select files_revision from engine_versions where id = $1",
      [versionId],
    );
    expect(restored.rows[0].files_revision).toBe(md5OfA);
  });

  it("kan inte skrivas manuellt — en skrivare kan inte ljuga om revisionen", async () => {
    await expect(
      pool.query("update engine_versions set files_revision = $1 where id = $2", [
        "deadbeef",
        versionId,
      ]),
    ).rejects.toThrow();
  });

  it("subselecten telemetrin använder returnerar versionens faktiska revision", async () => {
    const telemetryId = `tel_frtest_${randomUUID()}`;
    await insertTelemetryWithVersionRevision(telemetryId);

    const res = await pool.query<{ files_revision: string | null }>(
      "select files_revision from generation_telemetry where id = $1",
      [telemetryId],
    );
    expect(res.rows[0].files_revision).toBe(md5OfA);
  });

  it("telemetrins revision följer INTE med när versionen skrivs om — den är ett bevis, inte en spegel", async () => {
    // Detta är hela skälet till att kolumnen finns: ett verdikt ska beskriva det
    // innehåll det bedömde. Skrivs versionen om ska telemetriraden behålla sin
    // gamla revision, så att en läsare kan UPPTÄCKA mismatchen.
    const telemetryId = `tel_frtest_${randomUUID()}`;
    await insertTelemetryWithVersionRevision(telemetryId);

    await pool.query("update engine_versions set files_json = $1 where id = $2", [
      filesB,
      versionId,
    ]);

    const res = await pool.query<{ tel: string | null; ver: string | null }>(
      `select t.files_revision as tel, v.files_revision as ver
         from generation_telemetry t
         join engine_versions v on v.id = t.version_id
        where t.id = $1`,
      [telemetryId],
    );

    expect(res.rows[0].tel).toBe(md5OfA);
    expect(res.rows[0].ver).toBe(md5OfB);
    expect(res.rows[0].tel).not.toBe(res.rows[0].ver);

    await pool.query("update engine_versions set files_json = $1 where id = $2", [
      filesA,
      versionId,
    ]);
  });

  it("indexet på (version_id, files_revision) finns", async () => {
    const res = await pool.query<{ indexname: string }>(
      `select indexname from pg_indexes
        where tablename = 'generation_telemetry'
          and indexname = 'idx_generation_telemetry_version_revision'`,
    );
    expect(res.rowCount).toBe(1);
  });
});
