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
  users,
} from "@/lib/db/schema";
import { getKostnadsfriGenerationBySlug } from "./kostnadsfri";

const entitlement = {
  id: "ent_1",
  invitation_slug: "acme-ab",
  project_id: "proj_1",
  user_id: "user_1",
  initial_chat_id: null as string | null,
  initial_version_id: null,
  initial_claimed_at: null,
  created_at: new Date("2026-10-18T21:00:17Z"),
};
const projectChat = {
  id: "chat_1",
  projectId: "proj_1",
  createdAt: new Date("2026-10-18T21:01:04Z"),
};
const projectVersions = [
  { id: "ver_2", chatId: "chat_1", createdAt: new Date("2026-10-18T21:10:58Z") },
  { id: "ver_1", chatId: "chat_1", createdAt: new Date("2026-10-18T21:05:00Z") },
];
const notStarted = { state: "not-started", completedAt: null, siteId: null };

beforeEach(() => {
  process.env.ADMIN_EMAILS = "admin@example.com";
  rowsByTable.clear();
  rowsByTable.set(kostnadsfriCampaignEntitlements, [entitlement]);
  rowsByTable.set(generationBillings, []);
  rowsByTable.set(users, [{ id: "user_1", email: "admin@example.com" }]);
});

describe("getKostnadsfriGenerationBySlug for an admin builder without a bound chat", () => {
  it("reports the project's first version as succeeded", async () => {
    rowsByTable.set(engineChats, [projectChat]);
    rowsByTable.set(engineVersions, projectVersions);

    const result = await getKostnadsfriGenerationBySlug(["acme-ab"]);

    expect(result.get("acme-ab")).toEqual({
      state: "succeeded",
      completedAt: "2026-10-18T21:05:00.000Z",
      siteId: "proj_1",
    });
  });

  it("reports a started chat without versions from its latest generation log", async () => {
    rowsByTable.set(engineChats, [projectChat]);
    rowsByTable.set(engineGenerationLogs, [
      { chatId: "chat_1", success: false, createdAt: new Date("2026-10-18T21:03:00Z") },
    ]);

    const result = await getKostnadsfriGenerationBySlug(["acme-ab"]);

    expect(result.get("acme-ab")).toEqual({ state: "failed", completedAt: null, siteId: null });
  });

  it("stays not-started when the project has no chat yet", async () => {
    const result = await getKostnadsfriGenerationBySlug(["acme-ab"]);

    expect(result.get("acme-ab")).toEqual(notStarted);
  });

  it("ignores chats and versions the project had before the invitation was redeemed", async () => {
    rowsByTable.set(engineChats, [
      { ...projectChat, createdAt: new Date("2026-10-01T09:00:00Z") },
    ]);
    rowsByTable.set(engineVersions, [
      { id: "ver_old", chatId: "chat_1", createdAt: new Date("2026-10-01T09:05:00Z") },
    ]);

    const result = await getKostnadsfriGenerationBySlug(["acme-ab"]);

    expect(result.get("acme-ab")).toEqual(notStarted);
  });

  it("counts a newer version on a chat that existed before redemption", async () => {
    rowsByTable.set(engineChats, [
      { ...projectChat, createdAt: new Date("2026-10-01T09:00:00Z") },
    ]);
    rowsByTable.set(engineVersions, [
      { id: "ver_old", chatId: "chat_1", createdAt: new Date("2026-10-01T09:05:00Z") },
      { id: "ver_new", chatId: "chat_1", createdAt: new Date("2026-10-18T21:20:00Z") },
    ]);

    const result = await getKostnadsfriGenerationBySlug(["acme-ab"]);

    expect(result.get("acme-ab")).toEqual({
      state: "succeeded",
      completedAt: "2026-10-18T21:20:00.000Z",
      siteId: "proj_1",
    });
  });
});

describe("getKostnadsfriGenerationBySlug keeps the bound-chat projection", () => {
  it("does not fall back to project versions for a real recipient", async () => {
    rowsByTable.set(users, [{ id: "user_1", email: "kund@example.com" }]);
    rowsByTable.set(engineChats, [projectChat]);
    rowsByTable.set(engineVersions, projectVersions);

    const result = await getKostnadsfriGenerationBySlug(["acme-ab"]);

    expect(result.get("acme-ab")).toEqual(notStarted);
  });

  it("lets a bound campaign chat win over the project fallback", async () => {
    rowsByTable.set(kostnadsfriCampaignEntitlements, [
      { ...entitlement, initial_chat_id: "chat_bound" },
    ]);
    rowsByTable.set(engineChats, [projectChat]);
    rowsByTable.set(engineVersions, projectVersions);
    rowsByTable.set(engineGenerationLogs, [
      { chatId: "chat_bound", success: true, createdAt: new Date("2026-10-18T21:02:00Z") },
    ]);

    const result = await getKostnadsfriGenerationBySlug(["acme-ab"]);

    expect(result.get("acme-ab")).toEqual({
      state: "in-progress",
      completedAt: null,
      siteId: null,
    });
  });
});
