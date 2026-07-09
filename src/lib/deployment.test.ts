import { beforeEach, describe, expect, it, vi } from "vitest";

const selectLimit = vi.hoisted(() => vi.fn());
const updateWhere = vi.hoisted(() => vi.fn());
const updateReturning = vi.hoisted(() => vi.fn());
const getEngineChatByIdForRequest = vi.hoisted(() => vi.fn());
const getChatByIdForRequest = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        // `where().limit()` (setDeploymentDomainForRequest) och
        // `where().orderBy().limit()` (getLinkedDomainForChat) delar samma
        // `selectLimit`-mock — varje test sätter sitt eget returvärde.
        where: () => ({
          limit: selectLimit,
          orderBy: () => ({ limit: selectLimit }),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        // `where(...)` är awaitable (domän-helpers + non-error status-write)
        // OCH exponerar `.returning()` (error-transitionens villkorliga claim).
        where: (...args: unknown[]) =>
          Object.assign(Promise.resolve(updateWhere(...args)), {
            returning: updateReturning,
          }),
      }),
    }),
  },
}));

vi.mock("@/lib/tenant", () => ({
  getEngineChatByIdForRequest,
  getChatByIdForRequest,
}));

const { setDeploymentDomainForRequest, getLinkedDomainForChat, updateDeploymentStatus } =
  await import("./deployment");

function req() {
  return new Request("http://localhost/api/domains/save", { method: "POST" });
}

describe("setDeploymentDomainForRequest (A#3: engine + legacy chat resolution)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectLimit.mockResolvedValue([{ chatId: "engine_chat_1" }]);
    updateWhere.mockResolvedValue({ rowCount: 1 });
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByIdForRequest.mockResolvedValue(null);
  });

  it("returns false when the deployment row does not exist", async () => {
    selectLimit.mockResolvedValue([]);

    const result = await setDeploymentDomainForRequest(req(), "dep_missing", "site.example");

    expect(result).toBe(false);
    expect(updateWhere).not.toHaveBeenCalled();
  });

  // Core of A#3: own-engine deployments store an engine_chats.id in
  // deployments.chat_id, so the domain save must authorize via the engine
  // lookup (previously it used the legacy-only lookup and 404'd every time).
  it("saves the domain when the deployment's chat resolves as an owned engine chat", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "engine_chat_1", project_id: "proj_1" });

    const result = await setDeploymentDomainForRequest(req(), "dep_1", "site.example");

    expect(result).toBe(true);
    expect(getEngineChatByIdForRequest).toHaveBeenCalledTimes(1);
    // No need to fall back to the legacy lookup once the engine chat is owned.
    expect(getChatByIdForRequest).not.toHaveBeenCalled();
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("still authorizes legacy v0-era deployments via the legacy chat lookup", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByIdForRequest.mockResolvedValue({ id: "legacy_chat_1" });

    const result = await setDeploymentDomainForRequest(req(), "dep_legacy", "site.example");

    expect(result).toBe(true);
    expect(getChatByIdForRequest).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("returns false (no write) when neither engine nor legacy chat is owned by the caller", async () => {
    getEngineChatByIdForRequest.mockResolvedValue(null);
    getChatByIdForRequest.mockResolvedValue(null);

    const result = await setDeploymentDomainForRequest(req(), "dep_foreign", "site.example");

    expect(result).toBe(false);
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("returns false when the update affects no rows", async () => {
    getEngineChatByIdForRequest.mockResolvedValue({ id: "engine_chat_1", project_id: "proj_1" });
    updateWhere.mockResolvedValue({ rowCount: 0 });

    const result = await setDeploymentDomainForRequest(req(), "dep_1", "site.example");

    expect(result).toBe(false);
  });
});

// A2 (Ö2): read-helper som deploy-route:n använder för projektnamn-låset. Den
// returnerar senaste icke-null `deployments.domain` för chatten, eller null.
describe("getLinkedDomainForChat (A2: domain project-name lock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the chat has no domain-carrying deployment", async () => {
    selectLimit.mockResolvedValue([]);

    const result = await getLinkedDomainForChat("chat_1");

    expect(result).toBeNull();
  });

  it("returns the latest linked domain for the chat", async () => {
    selectLimit.mockResolvedValue([{ domain: "mysite.example" }]);

    const result = await getLinkedDomainForChat("chat_1");

    expect(result).toBe("mysite.example");
  });

  it("treats a whitespace-only domain value as no linked domain", async () => {
    selectLimit.mockResolvedValue([{ domain: "   " }]);

    const result = await getLinkedDomainForChat("chat_1");

    expect(result).toBeNull();
  });
});

// BB#deploy2: `updateDeploymentStatus` reports whether THIS call atomically
// flipped the row to `error`, so the webhook and the SSE-poll can log a build
// failure exactly once instead of both logging on `status === "error"`.
describe("updateDeploymentStatus (BB#deploy2: atomic error-transition claim)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateWhere.mockResolvedValue(undefined);
    updateReturning.mockResolvedValue([]);
  });

  it("reports transitionedToError=true when the conditional claim wins a row", async () => {
    updateReturning.mockResolvedValue([{ id: "dep_1" }]);

    const result = await updateDeploymentStatus("dep_1", "error", {
      inspectorUrl: "https://vercel.com/i/dep_1",
    });

    expect(result.transitionedToError).toBe(true);
    // The transition claim used the RETURNING path; no separate metadata write.
    expect(updateReturning).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("reports transitionedToError=false when the row is already error (claim returns no rows)", async () => {
    updateReturning.mockResolvedValue([]);

    const result = await updateDeploymentStatus("dep_1", "error", {
      inspectorUrl: "https://vercel.com/i/dep_1",
    });

    expect(result.transitionedToError).toBe(false);
    // Late metadata still merged via a second unconditional update.
    expect(updateReturning).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(2);
  });

  it("skips the metadata merge on a duplicate error with no extra metadata", async () => {
    updateReturning.mockResolvedValue([]);

    const result = await updateDeploymentStatus("dep_1", "error");

    expect(result.transitionedToError).toBe(false);
    // Only the claim's where() ran; nothing extra to persist.
    expect(updateReturning).toHaveBeenCalledTimes(1);
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });

  it("never reports a transition for a non-error status (unconditional write)", async () => {
    const result = await updateDeploymentStatus("dep_1", "ready", {
      url: "https://site.vercel.app",
    });

    expect(result.transitionedToError).toBe(false);
    // Non-error path does not use the conditional RETURNING claim.
    expect(updateReturning).not.toHaveBeenCalled();
    expect(updateWhere).toHaveBeenCalledTimes(1);
  });
});
