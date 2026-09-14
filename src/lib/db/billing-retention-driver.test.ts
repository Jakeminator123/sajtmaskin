// @vitest-environment node
/** Regression för felformen som Drizzles riktiga transport producerar. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());

vi.mock("./client", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  return { db: drizzle({ client: { query } as never }) };
});

const { countProtectedBillingRows, projectIdsWithBillingRows } =
  await import("./billing-retention-guard");

const EMPTY = { subscriptions: 0, grants: 0, jobs: 0, customers: 0 };

function missingRelation(): Error & { code: string } {
  return Object.assign(new Error("relation does not exist"), { code: "42P01" });
}

beforeEach(() => {
  query.mockReset();
});

describe("billing retention genom Drizzles node-postgres-transport", () => {
  it("känner igen den inlindade missing-table-koden vid räkning", async () => {
    query
      .mockRejectedValueOnce(missingRelation())
      .mockResolvedValueOnce({ rows: [{ all_missing: true }] });

    await expect(
      countProtectedBillingRows({ kind: "everything", keepEmails: [] }),
    ).resolves.toEqual(EMPTY);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("känner igen den inlindade missing-table-koden vid bakgrundsstädning", async () => {
    query
      .mockRejectedValueOnce(missingRelation())
      .mockResolvedValueOnce({ rows: [{ all_missing: true }] });

    await expect(projectIdsWithBillingRows(["legacy-project"])).resolves.toEqual(new Set());
    expect(query).toHaveBeenCalledTimes(2);
  });
});
