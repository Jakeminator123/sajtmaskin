// @vitest-environment node
/**
 * Postgres-backat kontraktstest för D1: atomisk `project_data.meta`-patch.
 *
 * Den gamla save-vägen läste `meta`, mergade i Node och ersatte hela
 * dokumentet. Två samtidiga autosaves mot olika top-level namespaces
 * (`palette` vs `seo`) som läste samma snapshot skrev över varandra.
 *
 * Den nya vägen skickar `meta_patch` och låter Postgres göra
 * `COALESCE(meta,'{}'::jsonb) || patch::jsonb` i samma UPSERT. JSONB `||`
 * är en *shallow* top-level merge — avsiktligt per namespace.
 *
 * Det här filen bevisar racet före/efter mot en riktig databas:
 * 1. Legacy read–merge–write med explicit barriär förlorar ett namespace.
 * 2. SQL-`||` med samma barriär behåller båda.
 * 3. `saveProjectData({ meta_patch })` via Drizzle behåller båda under
 *    `Promise.all` — det är den väg CI ska fälla om någon återinför RMW.
 *
 * Same-namespace-race för `seo` / `projectEnvVars` (två writers mot samma
 * nyckel) är D1b och testas inte här.
 *
 * Säkerhet: testet SKRIVER rader och vägrar allt utom en dev-target via
 * `check-db-env-target.mjs`. Alla id:n har ett unikt körprefix och raderas
 * i `afterAll` (`project_data` hänger i `ON DELETE CASCADE`).
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

// Vitest laddar inte `.env.local`. En explicit CI-URL ska alltid vinna.
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
    `[project-meta-atomic.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att D1-kontraktet testats).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

function createBarrier(count: number): { arrive(): Promise<void> } {
  let released!: () => void;
  const gate = new Promise<void>((resolve) => {
    released = resolve;
  });
  let arrived = 0;
  return {
    arrive() {
      arrived += 1;
      if (arrived >= count) released();
      return gate;
    },
  };
}

describe.skipIf(!target.url)("project_data.meta atomisk namespace-patch mot riktig Postgres", () => {
  const runTag = randomUUID();
  const createdProjectIds: string[] = [];

  let pool: Pool;
  let saveProjectData: typeof import("../../src/lib/db/services/projects").saveProjectData;
  let getProjectData: typeof import("../../src/lib/db/services/projects").getProjectData;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: target.url!,
      ssl: resolveSslConfig(target.url!),
      max: 3,
    });
    // Ladda servicen efter env-kontrollen: `@/lib/db/client` läser
    // POSTGRES_URL vid import och kastar utan den.
    const projects = await import("../../src/lib/db/services/projects");
    saveProjectData = projects.saveProjectData;
    getProjectData = projects.getProjectData;
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    if (createdProjectIds.length > 0) {
      await pool
        .query("delete from app_projects where id = any($1::text[])", [createdProjectIds])
        .catch(() => null);
    }
    await pool.end().catch(() => null);
  }, 60_000);

  async function seedProject(initialMeta: Record<string, unknown>): Promise<string> {
    const projectId = `prj_d1meta_${runTag}_${randomUUID()}`;
    createdProjectIds.push(projectId);
    await pool.query("insert into app_projects (id, name) values ($1, $2)", [
      projectId,
      "d1 meta atomic patch postgres-test",
    ]);
    await pool.query("insert into project_data (project_id, meta) values ($1, $2::jsonb)", [
      projectId,
      JSON.stringify(initialMeta),
    ]);
    return projectId;
  }

  async function readMeta(projectId: string): Promise<Record<string, unknown>> {
    const res = await pool.query<{ meta: Record<string, unknown> | null }>(
      "select meta from project_data where project_id = $1",
      [projectId],
    );
    const meta = res.rows[0]?.meta;
    return meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
  }

  /**
   * Gamla save-vägen: läs dokumentet, slå ihop i Node, skriv tillbaka.
   * Barriären släpper först när båda läst — då är lost-update deterministisk.
   */
  async function legacyReadMergeWrite(
    projectId: string,
    patch: Record<string, unknown>,
    arrive: () => Promise<void>,
  ): Promise<void> {
    const res = await pool.query<{ meta: Record<string, unknown> | null }>(
      "select coalesce(meta, '{}'::jsonb) as meta from project_data where project_id = $1",
      [projectId],
    );
    const current = res.rows[0]?.meta ?? {};
    const merged = { ...current, ...patch };
    await arrive();
    await pool.query(
      "update project_data set meta = $2::jsonb, updated_at = now() where project_id = $1",
      [projectId, JSON.stringify(merged)],
    );
  }

  async function sqlShallowPatch(
    projectId: string,
    patch: Record<string, unknown>,
    arrive: () => Promise<void>,
  ): Promise<void> {
    await arrive();
    await pool.query(
      `update project_data
          set meta = coalesce(meta, '{}'::jsonb) || $2::jsonb,
              updated_at = now()
        where project_id = $1`,
      [projectId, JSON.stringify(patch)],
    );
  }

  it("legacy read–merge–write förlorar ett samtidigt namespace (kontroll mot gamla implementationen)", async () => {
    const projectId = await seedProject({ previewOverride: { device: "desktop" } });
    const barrier = createBarrier(2);

    await Promise.all([
      legacyReadMergeWrite(projectId, { palette: { primary: "#111111" } }, () => barrier.arrive()),
      legacyReadMergeWrite(projectId, { seo: { optIn: true } }, () => barrier.arrive()),
    ]);

    const meta = await readMeta(projectId);
    const keptPalette = Boolean(meta.palette);
    const keptSeo = Boolean(meta.seo);
    expect(keptPalette && keptSeo).toBe(false);
    expect(keptPalette || keptSeo).toBe(true);
    expect(meta.previewOverride).toEqual({ device: "desktop" });
  });

  it("SQL COALESCE || patch behåller båda samtidiga namespaces", async () => {
    const projectId = await seedProject({ previewOverride: { device: "desktop" } });
    const barrier = createBarrier(2);

    await Promise.all([
      sqlShallowPatch(projectId, { palette: { primary: "#222222" } }, () => barrier.arrive()),
      sqlShallowPatch(projectId, { seo: { optIn: true, siteUrl: "https://kund.se" } }, () =>
        barrier.arrive(),
      ),
    ]);

    const meta = await readMeta(projectId);
    expect(meta.palette).toEqual({ primary: "#222222" });
    expect(meta.seo).toEqual({ optIn: true, siteUrl: "https://kund.se" });
    expect(meta.previewOverride).toEqual({ device: "desktop" });
  });

  it("saveProjectData(meta_patch) behåller samtidiga palette- och seo-skrivningar", async () => {
    const projectId = await seedProject({ previewOverride: { device: "mobile" } });

    await Promise.all([
      saveProjectData({
        project_id: projectId,
        meta_patch: { palette: { primary: "#abcdef" } },
      }),
      saveProjectData({
        project_id: projectId,
        meta_patch: { seo: { optIn: true } },
      }),
    ]);

    const row = await getProjectData(projectId);
    const meta =
      row?.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : {};
    expect(meta.palette).toEqual({ primary: "#abcdef" });
    expect(meta.seo).toEqual({ optIn: true });
    expect(meta.previewOverride).toEqual({ device: "mobile" });
  });

  it("full meta-snapshot raderar inte en redan lagrad rad", async () => {
    const projectId = await seedProject({
      palette: { primary: "#000000" },
      seo: { optIn: true },
    });

    await saveProjectData({
      project_id: projectId,
      meta: { source: "stale-full-snapshot" },
    });

    const meta = await readMeta(projectId);
    expect(meta.palette).toEqual({ primary: "#000000" });
    expect(meta.seo).toEqual({ optIn: true });
    expect(meta).not.toHaveProperty("source");
  });

  it("JSONB || är shallow — en namespace-patch ersätter hela objektet, inte fälten inuti", async () => {
    const projectId = await seedProject({
      seo: { optIn: true, siteUrl: "https://gammal.se" },
    });

    await saveProjectData({
      project_id: projectId,
      meta_patch: { seo: { optIn: false } },
    });

    const meta = await readMeta(projectId);
    expect(meta.seo).toEqual({ optIn: false });
    expect(meta.seo).not.toHaveProperty("siteUrl");
  });
});
