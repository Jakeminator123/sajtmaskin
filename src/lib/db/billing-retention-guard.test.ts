/**
 * Spärren är det enda som står mellan en adminrensning och en halvt raderad
 * miljö: databasens `ON DELETE RESTRICT` slår till först vid `app_projects`,
 * alltså efter att de tidigare tabellerna redan tömts. Testerna här handlar
 * därför om två saker — att den räknar rätt rader, och att den aldrig gör ett
 * fel till tyst grönt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const execute = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({ db: { execute } }));

const {
  BillingRetentionError,
  assertNoProtectedBillingRows,
  countProtectedBillingRows,
  hasProtectedBillingRows,
  projectIdsWithBillingRows,
} = await import("./billing-retention-guard");

beforeEach(() => {
  execute.mockReset();
});

describe("countProtectedBillingRows", () => {
  it("räknar abonnemang, grants och jobb i en enda fråga", async () => {
    execute.mockResolvedValue({ rows: [{ subscriptions: 2, grants: 3, jobs: 1 }] });

    await expect(countProtectedBillingRows({ kind: "allProjects" })).resolves.toEqual({
      subscriptions: 2,
      grants: 3,
      jobs: 1,
    });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("frågar inte alls när urvalet är tomt", async () => {
    await expect(
      countProtectedBillingRows({ kind: "projectIds", projectIds: [] }),
    ).resolves.toEqual({ subscriptions: 0, grants: 0, jobs: 0 });
    expect(execute).not.toHaveBeenCalled();
  });

  it("svarar noll när databasen saknar tabellerna", async () => {
    // En miljö som inte fått D1-migrationen har ingen bokföring att bevara.
    // Att låsa adminpanelen där vore fel svar på rätt fråga.
    execute.mockRejectedValue(Object.assign(new Error("relation missing"), { code: "42P01" }));

    await expect(countProtectedBillingRows({ kind: "allProjects" })).resolves.toEqual({
      subscriptions: 0,
      grants: 0,
      jobs: 0,
    });
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

describe("assertNoProtectedBillingRows", () => {
  it("släpper igenom när ingenting är bokfört", async () => {
    execute.mockResolvedValue({ rows: [{ subscriptions: 0, grants: 0, jobs: 0 }] });

    await expect(
      assertNoProtectedBillingRows("Nollställningen", { kind: "allProjects" }),
    ).resolves.toBeUndefined();
  });

  it("kastar med antal och svenskt besked så snart något är bokfört", async () => {
    execute.mockResolvedValue({ rows: [{ subscriptions: 1, grants: 0, jobs: 0 }] });

    const error = await assertNoProtectedBillingRows("Rensningen av projekt", {
      kind: "allProjects",
    }).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BillingRetentionError);
    expect((error as InstanceType<typeof BillingRetentionError>).counts.subscriptions).toBe(1);
    expect((error as Error).message).toContain("Rensningen av projekt");
    expect((error as Error).message).toContain("avbröts innan något raderades");
  });

  it("kastar även när bara ett jobb ligger kvar", async () => {
    execute.mockResolvedValue({ rows: [{ subscriptions: 0, grants: 0, jobs: 1 }] });

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
    expect(hasProtectedBillingRows({ subscriptions: 0, grants: 0, jobs: 0 })).toBe(false);
    expect(hasProtectedBillingRows({ subscriptions: 1, grants: 0, jobs: 0 })).toBe(true);
    expect(hasProtectedBillingRows({ subscriptions: 0, grants: 1, jobs: 0 })).toBe(true);
    expect(hasProtectedBillingRows({ subscriptions: 0, grants: 0, jobs: 1 })).toBe(true);
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
});
