// @vitest-environment node
/**
 * Postgres-backat kontrakt för SM-133: ett tomt projekt (ingen chatt, se
 * `startedProjectCondition`) räknas inte mot projekttaket och visas inte i
 * `/projects`, och listan och taket räknar samma rader.
 *
 * Enhetstestet `project-started.test.ts` ser den kompilerade SQL:en. Det här
 * testet kör den mot en riktig databas med tjänsternas egna funktioner
 * (`canCreateProject`, `getAllProjectsForOwner`, `getProjectByIdForOwner`).
 *
 * Säkerhet: testet SKRIVER fixturrader och vägrar allt utom en dev-target via
 * `check-db-env-target.mjs`. Fotavtryck: användare och projekt med ett unikt
 * körprefix, raderade i `afterAll` (chattar, project_data, project_files och
 * images följer projektet via CASCADE; domänorder, mediabibliotek och
 * företagsprofil raderas uttryckligen).
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { config as loadEnvFile } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import * as schema from "../../src/lib/db/schema";
import {
  checkDbEnvTarget,
  loadDbTargets,
  resolveConfiguredDbUrl,
} from "./check-db-env-target.mjs";
import { resolveSslConfig } from "./db-ssl.mjs";

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return state.db;
  },
  dbConfigured: true,
}));

if (existsSync(".env.local")) loadEnvFile({ path: ".env.local", override: false, quiet: true });

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
    `[empty-projects.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att definitionen körts mot en databas).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

describe.skipIf(!target.url)("tomma projekt mot riktig Postgres (SM-133)", () => {
  const run = randomUUID().replace(/-/gu, "").slice(0, 12);
  const id = (name: string) => `t_${run}_${name}`;
  const users = {
    tabs: id("u_tabs"),
    def: id("u_def"),
    other: id("u_other"),
    cap: id("u_cap"),
    under: id("u_under"),
    login: id("u_login"),
    content: id("u_content"),
  };
  const guestSession = id("sess_guest");
  const projectIds: string[] = [];
  let pool: Pool;
  let canCreateProject: typeof import("../../src/lib/projects/project-cleanup").canCreateProject;
  let services: typeof import("../../src/lib/db/services/projects");

  async function project(
    projectId: string,
    owner: { userId?: string; sessionId?: string },
    publishedSlug: string | null = null,
  ) {
    projectIds.push(projectId);
    await pool.query(
      `insert into app_projects (id, user_id, session_id, name, published_slug)
       values ($1, $2, $3, 'Namnlöst projekt', $4)`,
      [projectId, owner.userId ?? null, owner.sessionId ?? null, publishedSlug],
    );
  }

  /** Första bygget: chatten finns, ingen version (bygget kan ha misslyckats). */
  async function chat(projectId: string) {
    await pool.query("insert into engine_chats (id, project_id) values ($1, $2)", [
      `${projectId}_chat_${randomUUID().slice(0, 8)}`,
      projectId,
    ]);
  }

  async function listIds(scope: { userId?: string; sessionId?: string }) {
    const rows = await services.getAllProjectsForOwner(scope);
    return rows.map((row) => row.id).sort();
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: target.url!, ssl: resolveSslConfig(target.url!), max: 3 });
    state.db = drizzle(pool, { schema });
    canCreateProject = (await import("../../src/lib/projects/project-cleanup")).canCreateProject;
    services = await import("../../src/lib/db/services/projects");

    // Bara inloggningsanvändaren behöver en users-rad: claimen låser ägarraden.
    await pool.query(
      `insert into users (id, email, name, provider, email_verified)
       values ($1, $2, 'Tomma projekt', 'email', true)`,
      [users.login, `${users.login}@example.invalid`],
    );
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    for (const table of ["domain_orders", "media_library", "company_profiles"]) {
      await pool
        .query(`delete from ${table} where project_id = any($1::text[])`, [projectIds])
        .catch(() => null);
    }
    await pool
      .query("delete from app_projects where id = any($1::text[])", [projectIds])
      .catch(() => null);
    await pool.query("delete from users where id = $1", [users.login]).catch(() => null);
    await pool.end().catch(() => null);
  }, 60_000);

  it("två flikar: två tomma projekt tar ingen plats och syns inte; den som bygger syns", async () => {
    await project(id("tab_one"), { userId: users.tabs });
    await project(id("tab_two"), { userId: users.tabs });

    expect((await canCreateProject(users.tabs, null)).current).toBe(0);
    expect(await listIds({ userId: users.tabs })).toEqual([]);

    await chat(id("tab_one"));

    expect((await canCreateProject(users.tabs, null)).current).toBe(1);
    expect(await listIds({ userId: users.tabs })).toEqual([id("tab_one")]);
  });

  it("definitionen: chatt, äldre chatt/demo-url, domänorder och publicering räknas; tomma fält gör det inte", async () => {
    await project(id("def_chat"), { userId: users.def });
    await chat(id("def_chat"));

    await project(id("def_legacy_chat"), { userId: users.def });
    await pool.query("insert into project_data (project_id, chat_id) values ($1, 'v0_chat_1')", [
      id("def_legacy_chat"),
    ]);

    await project(id("def_legacy_demo"), { userId: users.def });
    await pool.query(
      "insert into project_data (project_id, demo_url) values ($1, 'https://demo.example.invalid')",
      [id("def_legacy_demo")],
    );

    await project(id("def_domain"), { userId: users.def });
    await pool.query("insert into domain_orders (id, project_id, domain) values ($1, $2, $3)", [
      id("order"),
      id("def_domain"),
      `${run}.example.invalid`,
    ]);

    await project(id("def_published"), { userId: users.def }, `t-${run}`);

    // Palettsparningen skapar project_data utan chatt; blanka fält är fortfarande tomt.
    await project(id("def_blank_data"), { userId: users.def });
    await pool.query(
      "insert into project_data (project_id, chat_id, demo_url, meta) values ($1, '', '  ', '{}'::jsonb)",
      [id("def_blank_data")],
    );
    await project(id("def_empty"), { userId: users.def });

    const started = [
      id("def_chat"),
      id("def_domain"),
      id("def_legacy_chat"),
      id("def_legacy_demo"),
      id("def_published"),
    ].sort();
    expect(await listIds({ userId: users.def })).toEqual(started);
    expect((await canCreateProject(users.def, null)).current).toBe(started.length);
  });

  it("innehåll utan chatt: sparad kod, filer, meddelanden, uppladdningar och egna uppgifter räknas", async () => {
    const owner = { userId: users.content };
    const withProjectData = async (name: string, columns: string, values: string) => {
      await project(id(name), owner);
      await pool.query(`insert into project_data (project_id, ${columns}) values ($1, ${values})`, [
        id(name),
      ]);
    };

    // Äldre projekt (v0-eran, tidig egen motor, «Spara») utan chatt och demo-url.
    await withProjectData("c_code", "current_code", "'export default function Page() {}'");
    await withProjectData("c_files", "files", `'[{"path":"app/page.tsx","content":"x"}]'::jsonb`);
    await withProjectData("c_messages", "messages", `'[{"role":"user","content":"hej"}]'::jsonb`);
    // Användarens egna uppgifter före första bygget.
    await withProjectData("c_business", "meta", `'{"business":{"phone":"070-000 00 00"}}'::jsonb`);
    await withProjectData("c_env", "meta", `'{"projectEnvVars":[{"key":"API_KEY"}]}'::jsonb`);

    await project(id("c_project_file"), owner);
    await pool.query("insert into project_files (project_id, path) values ($1, 'public/logo.png')", [
      id("c_project_file"),
    ]);
    await project(id("c_image"), owner);
    await pool.query(
      "insert into images (project_id, filename, file_path) values ($1, 'logo.png', '/uploads/logo.png')",
      [id("c_image")],
    );
    await project(id("c_media"), owner);
    await pool.query(
      `insert into media_library
         (user_id, filename, original_name, file_path, mime_type, file_type, size_bytes, project_id)
       values ($1, 'hero.jpg', 'hero.jpg', '/media/hero.jpg', 'image/jpeg', 'image', 1024, $2)`,
      [users.content, id("c_media")],
    );
    await project(id("c_company"), owner);
    await pool.query(
      "insert into company_profiles (project_id, company_name) values ($1, 'Café Lindgren')",
      [id("c_company")],
    );

    // Tomt trots project_data: paletten sparas automatiskt, och tomma fält räknas inte.
    await withProjectData(
      "e_palette",
      "current_code, files, messages, meta",
      `'  ', '[]'::jsonb, '[]'::jsonb, '{"palette":{"selections":[]},"business":null,"projectEnvVars":[]}'::jsonb`,
    );
    await project(id("e_bare"), owner);

    const withContent = [
      "c_business",
      "c_code",
      "c_company",
      "c_env",
      "c_files",
      "c_image",
      "c_media",
      "c_messages",
      "c_project_file",
    ]
      .map(id)
      .sort();
    expect(await listIds(owner)).toEqual(withContent);
    expect((await canCreateProject(users.content, null)).current).toBe(withContent.length);
  });

  it("ägarkontrollen: en annan ägares startade projekt räknas och syns bara för den ägaren", async () => {
    await project(id("other_started"), { userId: users.other });
    await chat(id("other_started"));

    expect(await listIds({ userId: users.other })).toEqual([id("other_started")]);
    expect((await canCreateProject(users.other, null)).current).toBe(1);
    expect(await listIds({ userId: users.def })).not.toContain(id("other_started"));
    expect(await listIds({ userId: users.tabs })).not.toContain(id("other_started"));
  });

  it("taket: åtta startade projekt stoppar, tomma projekt gör det inte", async () => {
    for (let index = 0; index < 8; index += 1) {
      await project(id(`cap_started_${index}`), { userId: users.cap });
      await chat(id(`cap_started_${index}`));
    }
    for (let index = 0; index < 3; index += 1) {
      await project(id(`cap_empty_${index}`), { userId: users.cap });
    }
    const atCap = await canCreateProject(users.cap, null, false);
    expect(atCap).toMatchObject({ allowed: false, current: 8, limit: 8 });
    expect(await listIds({ userId: users.cap })).toHaveLength(8);

    // Sju startade och fem tomma: förut 12 av 8 och stopp, nu 7 av 8.
    for (let index = 0; index < 7; index += 1) {
      await project(id(`under_started_${index}`), { userId: users.under });
      await chat(id(`under_started_${index}`));
    }
    for (let index = 0; index < 5; index += 1) {
      await project(id(`under_empty_${index}`), { userId: users.under });
    }
    expect(await canCreateProject(users.under, null, false)).toEqual({
      allowed: true,
      limit: 8,
      current: 7,
    });
  });

  it("anonym → inloggning → bygge: gästprojektet claimas och syns när chatten finns", async () => {
    await project(id("guest"), { sessionId: guestSession });

    // Gäst: tomt projekt varken räknas eller syns.
    expect((await canCreateProject(null, guestSession)).current).toBe(0);
    expect(await listIds({ sessionId: guestSession })).toEqual([]);

    // Inloggning: builderns hämtning av projektet claimar det åt användaren.
    const claimed = await services.getProjectByIdForOwner(id("guest"), {
      userId: users.login,
      sessionId: guestSession,
    });
    expect(claimed?.user_id).toBe(users.login);
    expect(await listIds({ userId: users.login, sessionId: guestSession })).toEqual([]);

    // Bygget skapar chatten i samma projekt.
    await chat(id("guest"));
    expect(await listIds({ userId: users.login, sessionId: guestSession })).toEqual([id("guest")]);
    expect(await listIds({ userId: users.login })).toEqual([id("guest")]);
    expect((await canCreateProject(users.login, guestSession)).current).toBe(1);
    // Claimat: syns inte längre för en ren gästsession.
    expect(await listIds({ sessionId: guestSession })).toEqual([]);
  });
});
