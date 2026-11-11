import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/client", async () => {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  return { db: drizzle({ client: { query } as never }), dbConfigured: true };
});
vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));

import { createPendingDomainOrder, DomainAlreadyOrderedError, markDomainOrderPaid } from "./domain-orders";
import { hasPostgresErrorCode } from "../postgres-errors";

const input = { userId: "u", chatId: "c", projectId: "p", vercelProjectId: null,
  domain: "example.com", registrar: "vercel", priceOre: 28600, wholesaleOre: 14300, currency: "SEK" };

beforeEach(() => { query.mockReset(); });

describe("domain order PostgreSQL conflict handling through the installed Drizzle adapter", () => {
  it("maps a wrapped reservation conflict to DomainAlreadyOrderedError", async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] }) // expiry sweep
      .mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));
    await expect(createPendingDomainOrder(input)).rejects.toBeInstanceOf(DomainAlreadyOrderedError);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it("routes a wrapped late-payment conflict to compensation", async () => {
    query.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));
    await expect(markDomainOrderPaid("order", "cs", "pi")).resolves.toEqual({ outcome: "domain_taken" });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("does not disguise other database failures as a domain conflict", async () => {
    query.mockRejectedValueOnce(Object.assign(new Error("idx_domain_orders_ query failed"), { code: "08006" }));
    await expect(markDomainOrderPaid("order", "cs", "pi")).rejects.toMatchObject({ cause: { code: "08006" } });
  });

  it("handles raw errors and nested causes, including cycles", () => {
    expect(hasPostgresErrorCode({ code: "23505" }, "23505")).toBe(true);
    expect(hasPostgresErrorCode(new Error("query", { cause: new Error("wrapper", { cause: { code: "23505" } }) }), "23505")).toBe(true);
    const cyclic: { cause?: unknown } = {}; cyclic.cause = cyclic;
    expect(hasPostgresErrorCode(cyclic, "23505")).toBe(false);
    expect(hasPostgresErrorCode(null, "23505")).toBe(false);
  });
});
