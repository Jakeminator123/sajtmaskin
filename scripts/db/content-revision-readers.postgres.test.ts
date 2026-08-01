// @vitest-environment node
/**
 * Postgres-backad test för **steg 3** i innehållsrevisionen: läsarna jämför.
 *
 * Varför den behövs bredvid de mockade sviterna: de renderar SQL och bevisar att
 * grinden *formuleras*. De kan per konstruktion inte bevisa att satsen är giltig
 * SQL, att subselecten pekar på rätt rad, eller — det viktigaste antagandet i
 * hela steget — att Postgres' `md5()` och Nodes `createHash("md5")` ger samma
 * värde för samma sträng. Gör de inte det ser varje jämförelse ut som en
 * mismatch, och en flagga som "bara" är blockerande vore resultatet.
 *
 * Filen bor här av samma skäl som `files-revision-contract.postgres.test.ts`:
 * DB-kontraktstesterna ligger i den här mappen, dev-target-grinden
 * (`check-db-env-target.mjs`) är en lokal `.mjs`-import, och CI kör lanen
 * (`npm run test:postgres`) mot en efemär Postgres. Koden som testas ligger i
 * `src/` och importeras via `@/`-aliaset.
 *
 * Säkerhet: testet SKRIVER rader, så det vägrar allt utom en dev-target.
 * Fotavtrycket är EN `engine_chats`-rad per svit; versioner och telemetri hänger
 * i `ON DELETE CASCADE` och städas med en DELETE i `afterAll`.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";

import { config as loadEnvFile } from "dotenv";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

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
 * I CI ska ett hopp INTE vara tillåtet — samma resonemang som i systerfilen:
 * vitest avslutar med 0 för skippade tester, så en försvunnen databas skulle
 * göra grinden grön utan att ha bevisat något.
 */
const requireDb = process.env.REQUIRE_POSTGRES_TESTS?.trim() === "1";

if (!target.url) {
  const message =
    `[content-revision.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att kontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

const FILES_BASE = JSON.stringify([{ path: "app/page.tsx", content: "bas" }]);
const FILES_REPAIRED = JSON.stringify([{ path: "app/page.tsx", content: "reparerad" }]);
const FILES_EDITED = JSON.stringify([{ path: "app/page.tsx", content: "user-edit" }]);
const md5 = (content: string) => createHash("md5").update(content, "utf8").digest("hex");

describe.skipIf(!target.url)("innehållsrevision steg 3 mot riktig Postgres", () => {
  const chatId = `chat_crtest_${Date.now()}`;
  let pool: Pool;
  let versionSeq = 0;

  // Ladda modulen EFTER env-kontrollen: `@/lib/db/client` läser
  // `POSTGRES_URL` vid import och kastar utan den.
  let telemetry: typeof import("@/lib/db/services/generation-telemetry");

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 3,
    });
    await pool.query("insert into engine_chats (id, title, model) values ($1, $2, $3)", [
      chatId,
      "innehållsrevision steg 3",
      "test-model",
    ]);
    telemetry = await import("@/lib/db/services/generation-telemetry");
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    await pool.query("delete from engine_chats where id = $1", [chatId]).catch(() => null);
    await pool.end().catch(() => null);
  }, 60_000);

  beforeEach(() => {
    telemetry.resetConfirmedPreviewReadyCacheForTests();
  });

  afterEach(() => {
    delete process.env.SAJTMASKIN_CONTENT_REVISION_GATE;
  });

  /** Ny version med `filesJson` som innehåll. Revisionen räknas av databasen. */
  async function createVersion(filesJson: string): Promise<string> {
    versionSeq += 1;
    const versionId = `ver_crtest_${Date.now()}_${versionSeq}`;
    await pool.query(
      `insert into engine_versions (id, chat_id, version_number, files_json)
       values ($1, $2, $3, $4)`,
      [versionId, chatId, versionSeq, filesJson],
    );
    return versionId;
  }

  async function rewriteVersionFiles(versionId: string, filesJson: string): Promise<void> {
    await pool.query("update engine_versions set files_json = $1 where id = $2", [
      filesJson,
      versionId,
    ]);
  }

  async function readTelemetry(versionId: string) {
    const res = await pool.query<{
      id: string;
      files_revision: string | null;
      preview_success: boolean | null;
      quality_gate_result: string | null;
    }>(
      `select id, files_revision, preview_success, quality_gate_result
         from generation_telemetry
        where version_id = $1
        order by created_at asc`,
      [versionId],
    );
    return res.rows;
  }

  it("Postgres md5() och Nodes createHash('md5') ger samma värde — hela jämförelsen bygger på det", async () => {
    const versionId = await createVersion(FILES_BASE);
    const res = await pool.query<{ files_revision: string | null }>(
      "select files_revision from engine_versions where id = $1",
      [versionId],
    );
    expect(res.rows[0].files_revision).toBe(md5(FILES_BASE));
  });

  describe("verdikt-läsaren", () => {
    it("ett verdikt för revision N besvarar inte en fråga om N+1 — i båda riktningar", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      const passedVersion = await createVersion(FILES_BASE);
      const failedVersion = await createVersion(FILES_BASE);

      await telemetry.createGenerationTelemetryRecord({
        chatId,
        versionId: passedVersion,
        model: "test-model",
        qualityGateResult: "preflight_passed",
      });
      await telemetry.createGenerationTelemetryRecord({
        chatId,
        versionId: failedVersion,
        model: "test-model",
        qualityGateResult: "verifier_failed",
      });

      // Före editen är båda verdikten svar om sitt innehåll.
      expect(
        (await telemetry.getLatestQualityGateSignalForVersion(passedVersion)).revisionMatch,
      ).toBe("current");
      expect(
        (await telemetry.getLatestQualityGateSignalForVersion(failedVersion)).revisionMatch,
      ).toBe("current");

      // En user-edit skriver om `files_json` → DB räknar om revisionen.
      await rewriteVersionFiles(passedVersion, FILES_EDITED);
      await rewriteVersionFiles(failedVersion, FILES_EDITED);

      const stalePassed = await telemetry.getLatestQualityGateSignalForVersion(passedVersion);
      const staleFailed = await telemetry.getLatestQualityGateSignalForVersion(failedVersion);

      expect(stalePassed.revisionMatch).toBe("stale");
      expect(stalePassed.verdictRevision).toBe(md5(FILES_BASE));
      expect(stalePassed.contentRevision).toBe(md5(FILES_EDITED));
      // Symmetrin (beslut 1a): ett failed kastas precis som ett passed.
      expect(staleFailed.revisionMatch).toBe("stale");
    });

    it("med flaggan av är samma rader dagens fail-open-svar", async () => {
      const versionId = await createVersion(FILES_BASE);
      await telemetry.createGenerationTelemetryRecord({
        chatId,
        versionId,
        model: "test-model",
        qualityGateResult: "preflight_passed",
      });
      await rewriteVersionFiles(versionId, FILES_EDITED);

      const signal = await telemetry.getLatestQualityGateSignalForVersion(versionId);

      expect(signal.revisionMatch).toBe("unknown");
      expect(signal.result).toBe("preflight_passed");
    });

    it("en rad utan revision (skriven före steg 2) är okänd, aldrig mismatch", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      const versionId = await createVersion(FILES_BASE);
      // Rad utan revision — precis som raderna före migrationen.
      await pool.query(
        `insert into generation_telemetry (id, chat_id, model, version_id, quality_gate_result)
         values ($1, $2, $3, $4, $5)`,
        [`tel_crtest_legacy_${versionSeq}`, chatId, "test-model", versionId, "verifier_failed"],
      );

      const signal = await telemetry.getLatestQualityGateSignalForVersion(versionId);

      expect(signal.revisionMatch).toBe("unknown");
      expect(signal.result).toBe("verifier_failed");
    });

    it("repair-accept jämför mot innehållet som promotas, inte mot versionens bas", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      const versionId = await createVersion(FILES_BASE);
      // Så här stämplar `saveRepairedFiles` repair-passet: revisionen räknas av
      // Postgres ur det promotbara innehållet, inte ur versionens `files_json`.
      await telemetry.createGenerationTelemetryRecord({
        chatId,
        versionId,
        model: "test-model",
        qualityGateResult: "preflight_passed",
        assessedFilesJson: FILES_REPAIRED,
        meta: { source: "server-repair-pass" },
      });

      // Utan `promotedFilesJson` ser passet ut att gälla ett annat innehåll…
      expect((await telemetry.getLatestQualityGateSignalForVersion(versionId)).revisionMatch).toBe(
        "stale",
      );
      // …och med det (vad `acceptRepair` skickar) är det ett svar.
      const signal = await telemetry.getLatestQualityGateSignalForVersion(versionId, {
        promotedFilesJson: FILES_REPAIRED,
      });
      expect(signal.revisionMatch).toBe("current");
      expect(signal.result).toBe("preflight_passed");
    });
  });

  describe("runtime-ready-kvittot (M#pv4)", () => {
    /**
     * Repro: v1 bootar och servas; ett server-repair passerar sin gate och
     * skapar en NY rad för innehållet i `repaired_files_json` som aldrig
     * bootats; nästa `running:true` för den gamla sessionen stämplar.
     */
    async function seedBaseAndRepairRows(versionId: string): Promise<void> {
      await telemetry.createGenerationTelemetryRecord({
        chatId,
        versionId,
        model: "test-model",
        qualityGateResult: "preflight_failed",
      });
      await telemetry.createGenerationTelemetryRecord({
        chatId,
        versionId,
        model: "test-model",
        qualityGateResult: "preflight_passed",
        assessedFilesJson: FILES_REPAIRED,
        meta: { source: "server-repair-pass" },
      });
    }

    it("stämplar raden för det innehåll VM:en servar, inte den nyaste raden", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      const versionId = await createVersion(FILES_BASE);
      await seedBaseAndRepairRows(versionId);

      await telemetry.recordPreviewRuntimeOutcomeForVersion(versionId, true);

      const rows = await readTelemetry(versionId);
      expect(rows).toHaveLength(2);
      const base = rows.find((r) => r.files_revision === md5(FILES_BASE));
      const repair = rows.find((r) => r.files_revision === md5(FILES_REPAIRED));
      expect(base?.preview_success).toBe(true);
      // Innehållet i repair-raden har aldrig bootats — den får inget kvitto.
      expect(repair?.preview_success).toBeNull();
    });

    it("kvittot landar på den revision VM:en BOOTADE, även när raden hunnit vidare", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      const versionId = await createVersion(FILES_BASE);
      // Raden för innehållet VM:en bootade (N)…
      await telemetry.createGenerationTelemetryRecord({
        chatId,
        versionId,
        model: "test-model",
        qualityGateResult: "preflight_passed",
      });
      // …och sedan hinner innehållet vidare till N+1 med en egen rad, medan
      // VM:en fortfarande servar N.
      await rewriteVersionFiles(versionId, FILES_EDITED);
      await telemetry.createGenerationTelemetryRecord({
        chatId,
        versionId,
        model: "test-model",
        qualityGateResult: "preflight_passed",
      });

      await telemetry.recordPreviewRuntimeOutcomeForVersion(versionId, true, {
        bootedFilesRevision: md5(FILES_BASE),
      });

      const rows = await readTelemetry(versionId);
      const booted = rows.find((r) => r.files_revision === md5(FILES_BASE));
      const advanced = rows.find((r) => r.files_revision === md5(FILES_EDITED));
      expect(booted?.preview_success).toBe(true);
      // Utan den bundna revisionen jämför satsen mot versionens NUVARANDE
      // innehåll och stämplar den här raden i stället — kvitto för fel innehåll.
      expect(advanced?.preview_success).toBeNull();
    });

    it("dokumenterar dagens beteende med flaggan av: kvittot landar på nyaste raden (M#pv4)", async () => {
      const versionId = await createVersion(FILES_BASE);
      await seedBaseAndRepairRows(versionId);

      await telemetry.recordPreviewRuntimeOutcomeForVersion(versionId, true);

      const rows = await readTelemetry(versionId);
      const base = rows.find((r) => r.files_revision === md5(FILES_BASE));
      const repair = rows.find((r) => r.files_revision === md5(FILES_REPAIRED));
      expect(repair?.preview_success).toBe(true);
      expect(base?.preview_success).toBeNull();
    });

    it("en rad utan revision är fortfarande stämpelbar (fail-open per rad)", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      const versionId = await createVersion(FILES_BASE);
      const legacyId = `tel_crtest_open_${versionSeq}`;
      await pool.query(
        `insert into generation_telemetry (id, chat_id, model, version_id)
         values ($1, $2, $3, $4)`,
        [legacyId, chatId, "test-model", versionId],
      );

      await telemetry.recordPreviewRuntimeOutcomeForVersion(versionId, true);

      const rows = await readTelemetry(versionId);
      expect(rows[0]?.id).toBe(legacyId);
      expect(rows[0]?.preview_success).toBe(true);
    });

    it("monotoniteten står kvar: ett fördröjt false skriver inte över ett bekräftat true", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      const versionId = await createVersion(FILES_BASE);
      await telemetry.createGenerationTelemetryRecord({
        chatId,
        versionId,
        model: "test-model",
        qualityGateResult: "preflight_passed",
      });

      await telemetry.recordPreviewRuntimeOutcomeForVersion(versionId, true);
      telemetry.resetConfirmedPreviewReadyCacheForTests();
      await telemetry.recordPreviewRuntimeOutcomeForVersion(versionId, false);

      const rows = await readTelemetry(versionId);
      expect(rows[0]?.preview_success).toBe(true);
    });

    it("confirmed-cachen släpper igenom ett nytt kvitto när innehållet skrivits om", async () => {
      process.env.SAJTMASKIN_CONTENT_REVISION_GATE = "true";
      const versionId = await createVersion(FILES_BASE);
      await telemetry.createGenerationTelemetryRecord({
        chatId,
        versionId,
        model: "test-model",
        qualityGateResult: "preflight_passed",
      });
      await telemetry.recordPreviewRuntimeOutcomeForVersion(versionId, true);
      expect(await telemetry.shouldVerifyPreviewRuntimeReceipt(versionId)).toBe(false);

      // Same-version-rewrite (t.ex. `targetVersionId`) + en ny rad för det
      // nya innehållet: kvittot måste kunna landa på den raden också.
      await rewriteVersionFiles(versionId, FILES_EDITED);
      expect(await telemetry.shouldVerifyPreviewRuntimeReceipt(versionId)).toBe(true);

      await telemetry.createGenerationTelemetryRecord({
        chatId,
        versionId,
        model: "test-model",
        qualityGateResult: "preflight_passed",
      });
      await telemetry.recordPreviewRuntimeOutcomeForVersion(versionId, true);

      const rows = await readTelemetry(versionId);
      expect(rows).toHaveLength(2);
      expect(rows[0]?.preview_success).toBe(true);
      expect(rows[1]?.files_revision).toBe(md5(FILES_EDITED));
      expect(rows[1]?.preview_success).toBe(true);
    });
  });
});
