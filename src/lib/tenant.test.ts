import { beforeEach, describe, expect, it, vi } from "vitest";

// The tenant guards resolve rows through the pg chat repository and the
// project service. Mock both so the ownership decision can be asserted without
// a database — the point of these tests is WHICH rows are allowed through, not
// how they are stored.
const getChat = vi.hoisted(() => vi.fn());
const getLatestVersion = vi.hoisted(() => vi.fn());
const getPreferredVersion = vi.hoisted(() => vi.fn());
const getVersionById = vi.hoisted(() => vi.fn());
const getProjectByIdForOwner = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  getChat,
  getLatestVersion,
  getPreferredVersion,
  getVersionById,
}));
vi.mock("@/lib/db/services/projects", () => ({ getProjectByIdForOwner }));
vi.mock("@/lib/auth/auth", () => ({
  getCurrentUser,
  getTokenFromRequest: () => null,
}));
vi.mock("@/lib/auth/session", () => ({ getSessionIdFromRequest: () => null }));

import { getLatestEngineVersionForChatForRequest } from "./tenant";

const req = new Request("https://sajtmaskin.test/api/openclaw/chat");
const ownedChat = { id: "chat-1", project_id: "proj-1", messages: [] };

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUser.mockResolvedValue({ id: "user-1" });
  getChat.mockResolvedValue(ownedChat);
  getProjectByIdForOwner.mockResolvedValue({ id: "proj-1" });
  getPreferredVersion.mockResolvedValue({ id: "ver-9", chat_id: "chat-1" });
  getLatestVersion.mockResolvedValue({ id: "ver-10", chat_id: "chat-1" });
});

describe("getLatestEngineVersionForChatForRequest", () => {
  it("resolves the chat's current version so a caller needs no version id", () => {
    // BB#oc1: OpenClaw held a chat id but no selected version, and the whole
    // debug context stayed locked because the gate demanded both.
    return expect(
      getLatestEngineVersionForChatForRequest(req, "chat-1"),
    ).resolves.toMatchObject({ version: { id: "ver-9" } });
  });

  it("falls back to the newest version when no preferred row exists", async () => {
    getPreferredVersion.mockResolvedValue(null);
    const scoped = await getLatestEngineVersionForChatForRequest(req, "chat-1");
    expect(scoped?.version.id).toBe("ver-10");
  });

  it("refuses a chat the caller does not own", async () => {
    // Same cross-tenant guard as the chat+version lookup: ownership comes from
    // the chat's app-project, so resolving the version server-side cannot widen
    // what a forged chat id reaches.
    getProjectByIdForOwner.mockResolvedValue(null);
    await expect(
      getLatestEngineVersionForChatForRequest(req, "chat-1"),
    ).resolves.toBeNull();
    expect(getPreferredVersion).not.toHaveBeenCalled();
    expect(getLatestVersion).not.toHaveBeenCalled();
  });

  it("returns null for a chat that has no versions yet", async () => {
    getPreferredVersion.mockResolvedValue(null);
    getLatestVersion.mockResolvedValue(null);
    await expect(
      getLatestEngineVersionForChatForRequest(req, "chat-1"),
    ).resolves.toBeNull();
  });
});
