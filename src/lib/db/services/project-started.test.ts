/**
 * SM-133: projekttaket och `/projects` läser samma definition av tomt projekt.
 *
 * Frågorna kompileras med Drizzles riktiga PostgreSQL-dialekt mot det riktiga
 * schemat, så testet ser exakt den SQL som skickas. Att Postgres svarar rätt på
 * den provas i `scripts/db/empty-projects.postgres.test.ts`.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listWhere = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          listWhere.value = condition;
          return { orderBy: () => Promise.resolve([]) };
        },
      }),
    }),
  },
  dbConfigured: true,
}));
vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));

const { startedProjectCondition } = await import("./project-started");
const { canCreateProject } = await import("@/lib/projects/project-cleanup");
const { getAllProjectsForOwner } = await import("./projects");

const dialect = new PgDialect();
const compile = (condition: unknown) => dialect.sqlToQuery(condition as SQL);
const STARTED = compile(startedProjectCondition()).sql;

/** En `database` för `canCreateProject` som svarar `count` och sparar WHERE. */
function countingDatabase(count: number) {
  const seen: { where: unknown } = { where: null };
  const database = {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          seen.where = condition;
          return Promise.resolve([{ count }]);
        },
      }),
    }),
  };
  return { database: database as never, seen };
}

describe("startedProjectCondition", () => {
  it("är sant för chatt, äldre chatt/demo-url, domänorder och publiceringsidentitet", () => {
    const { sql: text, params } = compile(startedProjectCondition());
    expect(text).toContain(
      'exists (select 1 from "engine_chats" where "engine_chats"."project_id" = "app_projects"."id")',
    );
    expect(text).toContain('"project_data"."project_id" = "app_projects"."id"');
    expect(text).toContain(`coalesce(btrim("project_data"."chat_id"), '') <> ''`);
    expect(text).toContain(`coalesce(btrim("project_data"."demo_url"), '') <> ''`);
    expect(text).toContain(
      'exists (select 1 from "domain_orders" where "domain_orders"."project_id" = "app_projects"."id")',
    );
    for (const column of [
      "vercel_project_id",
      "published_slug",
      "branded_domain",
      "custom_domain",
    ]) {
      expect(text).toContain(`"app_projects"."${column}" is not null`);
    }
    // Ett OR-block utan bundna värden: kan inte råka binda en annan ägares id.
    expect(params).toEqual([]);
  });
});

describe("canCreateProject räknar bara startade projekt", () => {
  it("inloggad: ägarvillkoret oförändrat, plus definitionen", async () => {
    const { database, seen } = countingDatabase(3);
    const result = await canCreateProject("user_1", "sess_1", false, database);

    expect(result).toEqual({ allowed: true, limit: 8, current: 3 });
    const { sql: text, params } = compile(seen.where);
    expect(text).toBe(`("app_projects"."user_id" = $1 and ${STARTED})`);
    expect(params).toEqual(["user_1"]);
  });

  it("nekar först när åtta STARTADE projekt finns", async () => {
    const { database } = countingDatabase(8);
    const result = await canCreateProject("user_1", null, false, database);
    expect(result.allowed).toBe(false);
    expect(result.current).toBe(8);
    expect(result.reason).toContain("8 projekt");
  });

  it("gäst: samma definition mot sessionens projekt", async () => {
    const { database, seen } = countingDatabase(0);
    const result = await canCreateProject(null, "sess_1", false, database);

    expect(result).toEqual({ allowed: true, limit: 3, current: 0 });
    const { sql: text, params } = compile(seen.where);
    expect(text).toBe(`("app_projects"."session_id" = $1 and ${STARTED})`);
    expect(params).toEqual(["sess_1"]);
  });
});

describe("getAllProjectsForOwner visar bara startade projekt", () => {
  beforeEach(() => {
    listWhere.value = null;
  });

  it("inloggad med gästcookie: egna projekt eller oclaimade sessionsprojekt, och startat", async () => {
    await getAllProjectsForOwner({ userId: "user_1", sessionId: "sess_1" });

    const { sql: text, params } = compile(listWhere.value);
    expect(text).toBe(
      `(("app_projects"."user_id" = $1 or ("app_projects"."user_id" is null and ` +
        `"app_projects"."session_id" = $2)) and ${STARTED})`,
    );
    expect(params).toEqual(["user_1", "sess_1"]);
  });

  it("gäst: bara sessionens oclaimade projekt, och startat", async () => {
    await getAllProjectsForOwner({ sessionId: "sess_1" });

    const { sql: text, params } = compile(listWhere.value);
    expect(text).toBe(
      `(("app_projects"."user_id" is null and "app_projects"."session_id" = $1) and ${STARTED})`,
    );
    expect(params).toEqual(["sess_1"]);
  });

  it("frågar inte alls utan ägare", async () => {
    await expect(getAllProjectsForOwner({})).resolves.toEqual([]);
    expect(listWhere.value).toBeNull();
  });
});
