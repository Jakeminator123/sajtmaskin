import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PgTable } from "drizzle-orm/pg-core";

const rowsByTable = vi.hoisted(() => new Map<unknown, Record<string, unknown>[]>());

vi.mock("./shared", () => ({ assertDbConfigured: vi.fn() }));
vi.mock("@/lib/db/client", () => {
  type Chain = Promise<Record<string, unknown>[]> & {
    where: () => Chain;
    orderBy: () => Chain;
    limit: () => Chain;
  };
  const query = (rows: Record<string, unknown>[]): Chain => {
    const chain: Chain = Object.assign(Promise.resolve(rows), {
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
    });
    return chain;
  };
  return {
    db: { select: () => ({ from: (table: PgTable) => query(rowsByTable.get(table) ?? []) }) },
  };
});

import {
  engineChats,
  engineGenerationLogs,
  engineVersions,
  generationBillings,
  kostnadsfriCampaignEntitlements,
} from "@/lib/db/schema";
import { getKostnadsfriGenerationBySlug } from "./kostnadsfri";

const entitlement = {
  id: "ent_1",
  invitation_slug: "acme-ab",
  project_id: "proj_1",
  initial_chat_id: null,
  initial_version_id: null,
  initial_claimed_at: null,
};

beforeEach(() => {
  rowsByTable.clear();
  rowsByTable.set(kostnadsfriCampaignEntitlements, [entitlement]);
  rowsByTable.set(generationBillings, []);
});

describe("getKostnadsfriGenerationBySlug without a bound campaign chat", () => {
  it("reports the project's first version as succeeded (admin/test builder)", async () => {
    rowsByTable.set(engineChats, [
      { id: "chat_1", projectId: "proj_1", createdAt: new Date("2026-10-18T21:01:04Z") },
    ]);
    rowsByTable.set(engineVersions, [
      { id: "ver_2", chatId: "chat_1", createdAt: new Date("2026-10-18T21:10:58Z") },
      { id: "ver_1", chatId: "chat_1", createdAt: new Date("2026-10-18T21:05:00Z") },
    ]);

    const result = await getKostnadsfriGenerationBySlug(["acme-ab"]);

    expect(result.get("acme-ab")).toEqual({
      state: "succeeded",
      completedAt: "2026-10-18T21:05:00.000Z",
      siteId: "proj_1",
    });
  });

  it("reports a started chat without versions from its latest generation log", async () => {
    rowsByTable.set(engineChats, [
      { id: "chat_1", projectId: "proj_1", createdAt: new Date("2026-10-18T21:01:04Z") },
    ]);
    rowsByTable.set(engineVersions, []);
    rowsByTable.set(engineGenerationLogs, [
      { chatId: "chat_1", success: false, createdAt: new Date("2026-10-18T21:03:00Z") },
    ]);

    const result = await getKostnadsfriGenerationBySlug(["acme-ab"]);

    expect(result.get("acme-ab")).toEqual({ state: "failed", completedAt: null, siteId: null });
  });

  it("stays not-started when the project has no chat yet", async () => {
    const result = await getKostnadsfriGenerationBySlug(["acme-ab"]);

    expect(result.get("acme-ab")).toEqual({
      state: "not-started",
      completedAt: null,
      siteId: null,
    });
  });
});
