// @vitest-environment node
/**
 * Postgres-backat kontrakt för projekttaket vid första chatten (SM-133, botfynd
 * på promote #1763): ett tomt projekt räknas inte mot taket, så taket måste hålla
 * när det tomma projektet får sin första chatt.
 *
 * Kör `createFirstChatWithinProjectCap` och `checkProjectCapForFirstChat` mot en
 * riktig databas med repots egen `createChat`, så att transaktionen, advisory-
 * låset och den sekventiella/samtidiga ordningen är äkta.
 *
 * Säkerhet: testet SKRIVER fixturrader och vägrar allt utom en dev-target via
 * `check-db-env-target.mjs`. Fotavtryck: projekt med ett unikt körprefix,
 * raderade i `afterAll` (chattar och project_data följer projektet via CASCADE).
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
    `[project-cap.postgres] ingen användbar dev-databas: ${target.reason}. ` +
    "Kör med en dev-POSTGRES_URL (t.ex. ur .env.local) eller CI:s tillfälliga Postgres.";
  if (requireDb) {
    throw new Error(
      `${message} REQUIRE_POSTGRES_TESTS=1 är satt, så ett hopp räknas som fel ` +
        "(annars hade grinden blivit grön utan att taket körts mot en databas).",
    );
  }
  console.warn(`${message} SKIPPAS.`);
}

describe.skipIf(!target.url)("projekttaket vid första chatten mot riktig Postgres (SM-133)", () => {
  const run = randomUUID().replace(/-/gu, "").slice(0, 12);
  const id = (name: string) => `cap_${run}_${name}`;
  const projectIds: string[] = [];
  let pool: Pool;
  let cap: typeof import("../../src/lib/projects/project-cap");
  let chatRepo: typeof import("../../src/lib/db/chat-repository-pg");

  const freeUser = (userId: string) => ({ userId, sessionId: null, isPaidUser: false });

  async function project(projectId: string, owner: { userId?: string; sessionId?: string }) {
    projectIds.push(projectId);
    await pool.query(
      "insert into app_projects (id, user_id, session_id, name) values ($1, $2, $3, 'Namnlöst projekt')",
      [projectId, owner.userId ?? null, owner.sessionId ?? null],
    );
  }

  async function startedProjects(owner: { userId?: string; sessionId?: string }, count: number) {
    for (let index = 0; index < count; index += 1) {
      const projectId = id(`${owner.userId ?? owner.sessionId}_started_${index}`);
      await project(projectId, owner);
      await pool.query("insert into engine_chats (id, project_id) values ($1, $2)", [
        `${projectId}_chat`,
        projectId,
      ]);
    }
  }

  function firstChat(projectId: string, owner: ReturnType<typeof freeUser>) {
    return cap.createFirstChatWithinProjectCap({
      projectId,
      owner,
      createChat: (database) =>
        chatRepo.createChat(projectId, "gpt-5.4", undefined, undefined, { database }),
    });
  }

  async function chatCount(projectId: string): Promise<number> {
    const result = await pool.query("select count(*)::int as n from engine_chats where project_id = $1", [
      projectId,
    ]);
    return result.rows[0].n as number;
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: target.url!, ssl: resolveSslConfig(target.url!), max: 4 });
    state.db = drizzle(pool, { schema });
    cap = await import("../../src/lib/projects/project-cap");
    chatRepo = await import("../../src/lib/db/chat-repository-pg");
  }, 60_000);

  afterAll(async () => {
    if (!pool) return;
    await pool
      .query("delete from app_projects where id = any($1::text[])", [projectIds])
      .catch(() => null);
    await pool.end().catch(() => null);
  }, 60_000);

  it("7 av 8 startade plus två tomma: första bygget går igenom, andra nekas", async () => {
    const user = id("u_seq");
    await startedProjects({ userId: user }, 7);
    await project(id("seq_tab_one"), { userId: user });
    await project(id("seq_tab_two"), { userId: user });

    const first = await firstChat(id("seq_tab_one"), freeUser(user));
    expect(first.status).toBe("created");
    expect(await chatCount(id("seq_tab_one"))).toBe(1);

    const second = await firstChat(id("seq_tab_two"), freeUser(user));
    expect(second).toMatchObject({
      status: "project_limit",
      denial: { allowed: false, limit: 8, current: 8 },
    });
    if (second.status === "project_limit") {
      expect(second.denial.reason).toContain("Ta bort ett projekt eller uppgradera");
    }
    expect(await chatCount(id("seq_tab_two"))).toBe(0);
  });

  it("två flikar samtidigt vid 7 av 8: exakt en får sin chatt", async () => {
    const user = id("u_race");
    await startedProjects({ userId: user }, 7);
    await project(id("race_tab_one"), { userId: user });
    await project(id("race_tab_two"), { userId: user });

    const results = await Promise.all([
      firstChat(id("race_tab_one"), freeUser(user)),
      firstChat(id("race_tab_two"), freeUser(user)),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["created", "project_limit"]);
    expect((await chatCount(id("race_tab_one"))) + (await chatCount(id("race_tab_two")))).toBe(1);
  });

  it("ett nytt bygge i ett redan startat projekt går igenom vid 8 av 8", async () => {
    const user = id("u_full");
    await startedProjects({ userId: user }, 8);
    const startedProjectId = id(`${user}_started_0`);

    expect(await cap.checkProjectCapForFirstChat(startedProjectId, freeUser(user))).toEqual({
      allowed: true,
    });
    const again = await firstChat(startedProjectId, freeUser(user));
    expect(again.status).toBe("created");
    expect(await chatCount(startedProjectId)).toBe(2);

    // Ett nytt projekt (import eller mall utan projekt) nekas däremot.
    expect(await cap.checkProjectCapForFirstChat(null, freeUser(user))).toMatchObject({
      allowed: false,
      limit: 8,
      current: 8,
    });
  });

  async function filledProjects(user: string, prefix: string, count: number, meta: string) {
    for (let index = 0; index < count; index += 1) {
      const projectId = id(`${prefix}_${index}`);
      await project(projectId, { userId: user });
      await pool.query(`insert into project_data (project_id, meta) values ($1, '${meta}'::jsonb)`, [
        projectId,
      ]);
    }
  }

  async function buildInOrder(user: string, prefix: string, count: number) {
    const statuses: string[] = [];
    for (let index = 0; index < count; index += 1) {
      statuses.push((await firstChat(id(`${prefix}_${index}`), freeUser(user))).status);
    }
    return statuses;
  }

  it("nio tomma projekt med företagsuppgifter: åtta byggs, det nionde nekas", async () => {
    const user = id("u_business");
    await filledProjects(user, "business", 9, '{"business":{"phone":"070-000 00 00"}}');

    expect(await buildInOrder(user, "business", 9)).toEqual([
      ...Array.from({ length: 8 }, () => "created"),
      "project_limit",
    ]);
    expect(await chatCount(id("business_8"))).toBe(0);
  });

  it("nio tomma projekt med miljövariabler: åtta byggs, det nionde nekas", async () => {
    const user = id("u_env");
    await filledProjects(user, "env", 9, '{"projectEnvVars":[{"key":"API_KEY"}]}');

    expect(await buildInOrder(user, "env", 9)).toEqual([
      ...Array.from({ length: 8 }, () => "created"),
      "project_limit",
    ]);
  });

  it("ett projekt med företagsuppgifter under taket får bygga", async () => {
    const user = id("u_under");
    await startedProjects({ userId: user }, 3);
    await filledProjects(user, "under_business", 1, '{"business":{"phone":"070-000 00 00"}}');

    const created = await firstChat(id("under_business_0"), freeUser(user));
    expect(created.status).toBe("created");
  });

  it("äldre byggda projekt räknas, men ett nytt bygge i ett av dem går igenom", async () => {
    const user = id("u_legacy");
    for (let index = 0; index < 8; index += 1) {
      const projectId = id(`legacy_${index}`);
      await project(projectId, { userId: user });
      await pool.query("insert into project_data (project_id, chat_id) values ($1, $2)", [
        projectId,
        `v0_chat_${index}`,
      ]);
    }
    await project(id("legacy_new"), { userId: user });

    expect((await firstChat(id("legacy_new"), freeUser(user))).status).toBe("project_limit");
    // Det äldre projektet räknas inte mot sig självt.
    expect((await firstChat(id("legacy_0"), freeUser(user))).status).toBe("created");
  });

  it("betalande konto: taket är 100, inte 8", async () => {
    const user = id("u_paid");
    await startedProjects({ userId: user }, 8);
    await project(id("paid_new"), { userId: user });

    const created = await firstChat(id("paid_new"), { userId: user, sessionId: null, isPaidUser: true });
    expect(created.status).toBe("created");
  });

  it("gäster: samma regel som i dag, tre startade per session", async () => {
    const session = id("sess_guest");
    await startedProjects({ sessionId: session }, 3);
    await project(id("guest_empty"), { sessionId: session });
    const guest = { userId: null, sessionId: session, isPaidUser: false };

    expect(await cap.checkProjectCapForFirstChat(id("guest_empty"), guest)).toMatchObject({
      allowed: false,
      limit: 3,
      current: 3,
    });
  });

  it("ägarskap: en annan ägares startade projekt räknas inte", async () => {
    const owner = id("u_owner");
    const other = id("u_other");
    await startedProjects({ userId: other }, 8);
    await project(id("owner_empty"), { userId: owner });

    const created = await firstChat(id("owner_empty"), freeUser(owner));
    expect(created.status).toBe("created");
  });
});
