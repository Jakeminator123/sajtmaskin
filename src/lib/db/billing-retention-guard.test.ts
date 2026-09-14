/**
 * Spärren är det enda som står mellan en adminrensning och en halvt raderad
 * miljö: databasens `ON DELETE RESTRICT` slår till först vid `app_projects`
 * (och för en kundrad utan abonnemang först vid den avslutande
 * användarraderingen), alltså efter att de tidigare tabellerna redan tömts.
 * Testerna här handlar därför om tre saker — att den räknar rätt rader, att den
 * skickar en fråga Postgres faktiskt kan köra, och att den aldrig gör ett fel
 * till tyst grönt.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({ db: { execute } }));

type BillingRetentionScope = import("./billing-retention-guard").BillingRetentionScope;

const {
  BillingRetentionError,
  assertNoProtectedBillingRows,
  countProtectedBillingRows,
  hasProtectedBillingRows,
  projectIdsWithBillingRows,
} = await import("./billing-retention-guard");

const EMPTY = { subscriptions: 0, grants: 0, jobs: 0, customers: 0 };

/**
 * Den SQL spärren faktiskt skickar, kompilerad av Drizzles RIKTIGA
 * PostgreSQL-dialekt. En mock av `db.execute` ser aldrig frågan; det var
 * precis därför en felbunden listparameter kunde ligga kvar grön.
 */
function compiledQuery(): { sql: string; params: unknown[] } {
  const query = execute.mock.calls.at(-1)?.[0] as SQL;
  const compiled = new PgDialect().sqlToQuery(query);
  return { sql: compiled.sql, params: compiled.params };
}

/** Hur många `count(*)`-delfrågor den kompilerade frågan innehåller. */
function countSubqueries(text: string): number {
  return text.match(/count\(\*\)/gu)?.length ?? 0;
}

beforeEach(() => {
  execute.mockReset();
  execute.mockResolvedValue({ rows: [{ ...EMPTY }] });
});

describe("countProtectedBillingRows", () => {
  it("räknar abonnemang, grants, jobb och kundrader i en enda fråga", async () => {
    execute.mockResolvedValue({ rows: [{ subscriptions: 2, grants: 3, jobs: 1, customers: 4 }] });

    await expect(
      countProtectedBillingRows({ kind: "everything", keepEmails: ["admin@example.test"] }),
    ).resolves.toEqual({ subscriptions: 2, grants: 3, jobs: 1, customers: 4 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("frågar inte alls när urvalet är tomt", async () => {
    await expect(
      countProtectedBillingRows({ kind: "projectIds", projectIds: [] }),
    ).resolves.toEqual(EMPTY);
    expect(execute).not.toHaveBeenCalled();
  });

  it("svarar noll när databasen saknar tabellerna", async () => {
    // En miljö som inte fått D1-migrationen har ingen bokföring att bevara.
    // Att låsa adminpanelen där vore fel svar på rätt fråga.
    execute.mockRejectedValue(Object.assign(new Error("relation missing"), { code: "42P01" }));

    await expect(countProtectedBillingRows({ kind: "allProjects" })).resolves.toEqual(EMPTY);
  });

  it("sväljer inte andra databasfel", async () => {
    // Ett trasigt anrop får inte se ut som "inga abonnemang" — då hade spärren
    // öppnat sig själv vid fel.
    execute.mockRejectedValue(Object.assign(new Error("connection lost"), { code: "08006" }));

    await expect(countProtectedBillingRows({ kind: "allProjects" })).rejects.toThrow(
      "connection lost",
    );
  });
});

describe("countProtectedBillingRows — kundraderna räknas där användare raderas", () => {
  it("räknar dem för nollställningen och för användarrensningen", async () => {
    // Fyra delfrågor: abonnemang, grants, jobb OCH kundrader.
    const scopes: BillingRetentionScope[] = [
      { kind: "everything", keepEmails: ["admin@example.test"] },
      { kind: "usersExcept", keepEmails: ["admin@example.test"] },
    ];
    for (const scope of scopes) {
      await countProtectedBillingRows(scope);
      expect(countSubqueries(compiledQuery().sql), scope.kind).toBe(4);
    }
  });

  it("räknar dem inte för rensningar som lämnar användarna kvar", async () => {
    // En projektrensning rör inte `users`, så ingen kundrad står i vägen — och
    // spärren får inte låsa den åtgärden i onödan.
    const scopes: BillingRetentionScope[] = [
      { kind: "allProjects" },
      { kind: "projectIds", projectIds: ["prj_a"] },
    ];
    for (const scope of scopes) {
      await countProtectedBillingRows(scope);
      const { sql: text } = compiledQuery();
      expect(countSubqueries(text), scope.kind).toBe(3);
      expect(text, scope.kind).toContain("0 AS customers");
    }
  });

  it("blockerar en rensning där bara en kundrad finns kvar", async () => {
    // Övergiven checkout: Stripe-kunden finns, abonnemanget aldrig. Utan den här
    // posten fick `reset-all` noll från spärren och raderade halva miljön innan
    // kundradens RESTRICT stoppade den sista användarraderingen.
    execute.mockResolvedValue({
      rows: [{ subscriptions: 0, grants: 0, jobs: 0, customers: 1 }],
    });

    const error = await assertNoProtectedBillingRows("Nollställningen", {
      kind: "everything",
      keepEmails: ["admin@example.test"],
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BillingRetentionError);
    expect((error as InstanceType<typeof BillingRetentionError>).counts.customers).toBe(1);
    expect((error as Error).message).toContain("1 kundrader");
  });
});

describe("countProtectedBillingRows — listor blir riktiga PostgreSQL-arrayer", () => {
  // Drizzle expanderar ett interpolerat JS-fält till en parameter per post:
  // `ANY(($1, $2)::text[])` är en record Postgres vägrar casta (42846), och
  // `ANY(($1)::text[])` är en ogiltig arrayliteral (22P02). Mockade tabeller
  // såg inget av det, för de ser aldrig den kompilerade frågan.
  const ONE = ["prj_only"];
  const MANY = ["prj_a", "prj_b", "prj_c"];

  for (const projectIds of [ONE, MANY]) {
    it(`binder en projektlista med ${projectIds.length} post(er) som en enda parameter`, async () => {
      await countProtectedBillingRows({ kind: "projectIds", projectIds });

      const { sql: text, params } = compiledQuery();
      // Ett predikat per delfråga → en parameter per delfråga, aldrig en per post.
      expect(text).toContain("ANY($1::text[])");
      expect(text).toContain("ANY($2::text[])");
      expect(text).toContain("ANY($3::text[])");
      expect(text).not.toMatch(/ANY\(\(/u);
      expect(params).toEqual([projectIds, projectIds, projectIds]);
    });
  }

  for (const keepEmails of [["solo@example.test"], ["a@example.test", "b@example.test"]]) {
    it(`binder en e-postlista med ${keepEmails.length} post(er) som en enda parameter`, async () => {
      // `usersExcept` använder adresslistan i alla fyra delfrågorna.
      await countProtectedBillingRows({ kind: "usersExcept", keepEmails });

      const { sql: text, params } = compiledQuery();
      expect(text).toContain("ANY($1::text[])");
      expect(text).toContain("ANY($4::text[])");
      expect(text).not.toMatch(/ANY\(\(/u);
      expect(params).toEqual([keepEmails, keepEmails, keepEmails, keepEmails]);
    });

    it(`binder nollställningens ${keepEmails.length} skyddade adress(er) mot kundraderna`, async () => {
      // Nollställningen tar varje projekt, så abonnemangsdelfrågorna behöver
      // inget predikat — adresslistan används bara mot kundraderna.
      await countProtectedBillingRows({ kind: "everything", keepEmails });

      const { sql: text, params } = compiledQuery();
      expect(text).toContain("ANY($1::text[])");
      expect(text).not.toMatch(/ANY\(\(/u);
      expect(params).toEqual([keepEmails]);
    });
  }

  it("frågar utan parameter när ingen adress är skyddad", async () => {
    await countProtectedBillingRows({ kind: "usersExcept", keepEmails: [] });

    expect(compiledQuery().params).toEqual([]);
  });
});

describe("assertNoProtectedBillingRows", () => {
  it("släpper igenom när ingenting är bokfört", async () => {
    execute.mockResolvedValue({ rows: [{ ...EMPTY }] });

    await expect(
      assertNoProtectedBillingRows("Nollställningen", { kind: "allProjects" }),
    ).resolves.toBeUndefined();
  });

  it("kastar med antal och svenskt besked så snart något är bokfört", async () => {
    execute.mockResolvedValue({ rows: [{ ...EMPTY, subscriptions: 1 }] });

    const error = await assertNoProtectedBillingRows("Rensningen av projekt", {
      kind: "allProjects",
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BillingRetentionError);
    expect((error as InstanceType<typeof BillingRetentionError>).counts.subscriptions).toBe(1);
    expect((error as Error).message).toContain("Rensningen av projekt");
    expect((error as Error).message).toContain("avbröts innan något raderades");
  });

  it("kastar även när bara ett jobb ligger kvar", async () => {
    execute.mockResolvedValue({ rows: [{ ...EMPTY, jobs: 1 }] });

    await expect(
      assertNoProtectedBillingRows("Rensningen av användare", {
        kind: "usersExcept",
        keepEmails: ["admin@example.test"],
      }),
    ).rejects.toBeInstanceOf(BillingRetentionError);
  });
});

describe("hasProtectedBillingRows", () => {
  it("är sann för varje tabell var för sig", () => {
    expect(hasProtectedBillingRows(EMPTY)).toBe(false);
    expect(hasProtectedBillingRows({ ...EMPTY, subscriptions: 1 })).toBe(true);
    expect(hasProtectedBillingRows({ ...EMPTY, grants: 1 })).toBe(true);
    expect(hasProtectedBillingRows({ ...EMPTY, jobs: 1 })).toBe(true);
    expect(hasProtectedBillingRows({ ...EMPTY, customers: 1 })).toBe(true);
  });
});

describe("projectIdsWithBillingRows", () => {
  it("pekar ut exakt de projekt bakgrundsstädningen ska hoppa över", async () => {
    execute.mockResolvedValue({ rows: [{ project_id: "prj_paid" }] });

    await expect(projectIdsWithBillingRows(["prj_paid", "prj_free"])).resolves.toEqual(
      new Set(["prj_paid"]),
    );
  });

  it("frågar inte för en tom lista", async () => {
    await expect(projectIdsWithBillingRows([])).resolves.toEqual(new Set());
    expect(execute).not.toHaveBeenCalled();
  });

  for (const projectIds of [["prj_only"], ["prj_a", "prj_b"]]) {
    it(`binder ${projectIds.length} projekt-id som en enda arrayparameter`, async () => {
      execute.mockResolvedValue({ rows: [] });

      await projectIdsWithBillingRows(projectIds);

      const { sql: text, params } = compiledQuery();
      expect(text).toContain("ANY($1::text[])");
      expect(text).not.toMatch(/ANY\(\(/u);
      expect(params).toEqual([projectIds]);
    });
  }
});
