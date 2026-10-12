import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  acquire: vi.fn(), renew: vi.fn(), release: vi.fn(), presence: vi.fn(),
  version: vi.fn(), chat: vi.fn(), session: vi.fn(), lookup: vi.fn(), claim: vi.fn(), commit: vi.fn(),
  crawl: vi.fn(), begin: vi.fn(), finish: vi.fn(), remove: vi.fn(), abandon: vi.fn(), verdict: vi.fn(),
  policySkip: vi.fn(),
}));
vi.mock("@/lib/config", () => ({ FEATURES: { f2ProductPostcheck: true } }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  acquireVersionLease: mocks.acquire, renewVersionLease: mocks.renew, releaseVersionLease: mocks.release,
  leaseTableExists: mocks.presence, getVersionById: mocks.version, getChat: mocks.chat,
}));
vi.mock("@/lib/db/services/product-postcheck-runs", () => ({
  claimProductPostcheckRun: mocks.claim, lookupProductPostcheckRun: mocks.lookup,
  normalizeProductPostcheckMutationRevision: (value: number | null | undefined) => value ?? 0,
}));
vi.mock("@/lib/db/services/version-errors", () => ({ commitProductPostcheckResult: mocks.commit, storeProductPostcheckPolicySkip: mocks.policySkip }));
vi.mock("@/lib/db/services/live-review-runs", () => ({
  isLiveReviewHeldContext: (value: unknown) => value && typeof value === "object" &&
    ["chatId", "versionId", "filesRevision", "holderRunId"].every(key => typeof (value as Record<string, unknown>)[key] === "string"),
  deleteLiveReviewScreenshotUrls: mocks.remove, abandonLiveReviewRun: mocks.abandon,
}));
vi.mock("@/lib/gen/preview/session-store", () => ({ getActivePreviewSessionAsync: mocks.session }));
vi.mock("@/lib/gen/preview/tier2-config", () => ({ getPreviewHostBaseUrl: () => null }));
vi.mock("@/lib/logging/event-bus", () => ({ emit: vi.fn() }));
vi.mock("@/lib/integrations/tier3-readiness-gate", () => ({ readProductPostcheckVerdictForVersion: mocks.verdict }));
vi.mock("@/lib/openclaw/live-review-access", () => ({ isLiveReviewEnabled: () => true }));
vi.mock("./product-postcheck", () => ({ runProductPostcheck: mocks.crawl }));
vi.mock("./live-review-session", () => ({ beginLiveReviewSession: mocks.begin, finishLiveReviewSession: mocks.finish }));
vi.mock("./live-review", () => ({
  LIVE_REVIEW_TOTAL_TIMEOUT_MS: 90_000, summarizeBrief: () => "",
  resolveUserRequestForVersion: () => ({ text: "canonical", source: "version_message_id" }),
}));
import { runHeldVersionProductPostcheck, runVersionProductPostcheck } from "./version-product-postcheck";
import { FEATURES } from "@/lib/config";
function setF2ProductPostcheck(value: boolean) {
  Object.defineProperty(FEATURES, "f2ProductPostcheck", { value, configurable: true });
}
const held = { chatId: "c1", versionId: "v1", filesRevision: "rev1", holderRunId: "holder1" };
const input = { chatId: "c1", versionId: "v1", userId: "user1", previewUrl: "https://client.example" };
const version = { id: "v1", chat_id: "c1", files_revision: "rev1", files_json: "[]", version_number: 1 };
const session = { versionId: "v1", filesRevision: "rev1", previewSessionId: "ps1", lifecycleToken: "life1",
  mutationRevision: 2, previewUrl: "https://session.example" };
const clean = { ok: true, skipped: false, skippedReason: null, warnings: [], warningCount: 0, productBlocked: false,
  routesChecked: 1, durationMs: 3, checkedUrl: session.previewUrl, screenshots: null, domSummary: null };
beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.version.mockResolvedValue(version); mocks.chat.mockResolvedValue({ id: "c1", messages: [] });
  mocks.session.mockResolvedValue(session); mocks.presence.mockResolvedValue("exists");
  mocks.lookup.mockResolvedValue({ kind: "unclaimed" }); mocks.acquire.mockResolvedValue({ runId: "holder1" });
  mocks.renew.mockResolvedValue(true); mocks.release.mockResolvedValue(undefined);
  mocks.claim.mockResolvedValue({ kind: "acquired", runId: "product1", claimGeneration: 1, owner: "user1" });
  mocks.begin.mockResolvedValue({ captureEnabled: true, allowed: true, claim: null, earlyResult: null });
  mocks.finish.mockResolvedValue({ status: "skipped", reason: "no_screenshots" });
  mocks.crawl.mockImplementation(async () => ({ ...clean }));
  mocks.commit.mockResolvedValue({ status: "stored", logs: [] });
  mocks.remove.mockResolvedValue(undefined); mocks.abandon.mockResolvedValue(undefined);
  mocks.verdict.mockResolvedValue({ verdict: "pending" });
  setF2ProductPostcheck(true);
  mocks.policySkip.mockResolvedValue({ status: "stored", logs: [{ id: "policy1" }] });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("wrapper and held core", () => {
  it("real OFF stores a revision-bound receipt without a lease, preview, browser or LR", async () => {
    setF2ProductPostcheck(false);
    expect(await runVersionProductPostcheck(input)).toMatchObject({ kind: "result", result: {
      skippedReason: "feature_disabled", storageReceipt: { status: "stored", versionId: "v1", filesRevision: "rev1" } } });
    expect(mocks.policySkip).toHaveBeenCalledWith({ chatId: "c1", versionId: "v1", expectedFilesRevision: "rev1" });
    expect(mocks.acquire).not.toHaveBeenCalled(); expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.crawl).not.toHaveBeenCalled(); expect(mocks.begin).not.toHaveBeenCalled();
  });
  it("OFF rejects arbitrary request revision and unscoped version before policy write", async () => {
    setF2ProductPostcheck(false);
    expect(await runVersionProductPostcheck({ ...input, filesRevision: "forged" })).toMatchObject({ result: { skippedReason: "preview_superseded" } });
    mocks.version.mockResolvedValue({ ...version, chat_id: "other" });
    expect(await runVersionProductPostcheck(input)).toEqual({ kind: "not_found" });
    expect(mocks.policySkip).not.toHaveBeenCalled();
  });
  it("OFF persistence failure cannot fabricate a storage receipt", async () => {
    setF2ProductPostcheck(false);
    mocks.policySkip.mockResolvedValue({ status: "contention", logs: [] });
    expect(await runVersionProductPostcheck(input)).toEqual({ kind: "unavailable", code: "claim_unavailable" });
  });
  it.each(["busy", "settled"])("pure %s replay takes no lease/claim/browser/LR", async kind => {
    mocks.lookup.mockResolvedValue({ kind, runId: "winner", claimGeneration: 2, status: kind === "busy" ? "running" : "passed" });
    mocks.verdict.mockResolvedValue({ verdict: kind === "busy" ? "pending" : "passed" });
    await runVersionProductPostcheck(input);
    expect(mocks.acquire).not.toHaveBeenCalled(); expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.crawl).not.toHaveBeenCalled(); expect(mocks.begin).not.toHaveBeenCalled();
  });
  it("acquires, re-reads, claims, commits, and releases while HTTP stays outside the core", async () => {
    const result = await runVersionProductPostcheck(input);
    expect(result).toMatchObject({ kind: "result", result: { skipped: false, verificationRunId: "product1" } });
    expect(mocks.acquire.mock.invocationCallOrder[0]).toBeLessThan(mocks.claim.mock.invocationCallOrder[0]);
    expect(mocks.version.mock.invocationCallOrder.some(order => order > mocks.acquire.mock.invocationCallOrder[0] && order < mocks.claim.mock.invocationCallOrder[0])).toBe(true);
    expect(mocks.begin).toHaveBeenCalledWith(expect.objectContaining({ held, deadlineAt: expect.any(Number) }));
    expect(mocks.crawl).toHaveBeenCalledWith(expect.objectContaining({ previewUrl: session.previewUrl }));
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ held, claim: expect.objectContaining({ runId: "product1" }) }));
    expect(mocks.release).toHaveBeenCalledWith("v1", "holder1");
  });
  it("held deterministic import policy cannot reach capture, reservation, critic or LR claim", async () => {
    const result = await runHeldVersionProductPostcheck({ ...input, held, deadlineAt: Date.now() + 280_000, liveReviewPolicy: "disabled" });
    expect(result).toMatchObject({ kind: "result", result: { skipped: false } });
    expect(mocks.begin).not.toHaveBeenCalled(); expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.crawl).toHaveBeenCalledWith(expect.objectContaining({ captureEnabled: false, liveReviewAllowed: false }));
    expect(mocks.commit).toHaveBeenCalledWith(expect.objectContaining({ result: expect.objectContaining({ attestation: {
      previewSessionId: "ps1", lifecycleToken: "life1", filesRevision: "rev1" } }) }));
    expect(mocks.acquire).not.toHaveBeenCalled(); expect(mocks.release).not.toHaveBeenCalled();
  });
  it.each(["false", "throw"])("renew %s after crawl stops before paid review and canonical writes", async failure => {
    mocks.crawl.mockImplementation(async () => {
      if (failure === "false") mocks.renew.mockResolvedValue(false); else mocks.renew.mockRejectedValue(new Error("offline renewal"));
      return { ...clean };
    });
    const result = await runVersionProductPostcheck(input);
    expect(result).toMatchObject({ kind: "result", result: { skippedReason: "preview_superseded", attestation: null } });
    expect(mocks.finish).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalled();
  });
  it.each(["revision", "session", "lifecycle", "mutation"])("target %s drift after crawl stops before critic/write", async failure => {
    mocks.crawl.mockImplementation(async () => {
      if (failure === "revision") mocks.version.mockResolvedValue({ ...version, files_revision: "rev2" });
      else mocks.session.mockResolvedValue({ ...session, ...(failure === "session" ? { previewSessionId: "ps2" } :
        failure === "lifecycle" ? { lifecycleToken: "life2" } : { mutationRevision: 3 }) });
      return { ...clean };
    });
    await runVersionProductPostcheck(input);
    expect(mocks.finish).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });
  it("denied atomic persistence never returns pass or release proof", async () => {
    mocks.commit.mockResolvedValue({ status: "superseded", logs: [] });
    expect(await runVersionProductPostcheck(input)).toMatchObject({ kind: "result", result: { skipped: true, attestation: null } });
  });
  it("persistence error is unavailable, never a successful result", async () => {
    mocks.commit.mockRejectedValue(new Error("rollback"));
    expect(await runVersionProductPostcheck(input)).toEqual({ kind: "unavailable", code: "claim_unavailable" });
    expect(mocks.release).toHaveBeenCalled();
  });
  it("late/exhausted deadline does not manufacture the old 8s crawl floor", async () => {
    const result = await runHeldVersionProductPostcheck({ ...input, held, deadlineAt: Date.now() + 10_001 });
    expect(result).toMatchObject({ kind: "result", result: { skipped: true } });
    expect(mocks.crawl).not.toHaveBeenCalled(); expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("passes real remaining time, including persistence/release reserve, to crawl and critic", async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    await runHeldVersionProductPostcheck({ ...input, held, deadlineAt: 280_000 });
    expect(mocks.crawl).toHaveBeenCalledWith(expect.objectContaining({ timeoutMs: 80_000 }));
    expect(mocks.begin).toHaveBeenCalledWith(expect.objectContaining({ deadlineAt: 270_000 }));
  });
  it("a critic error preserves deterministic blockers", async () => {
    mocks.crawl.mockResolvedValue({ ...clean, productBlocked: true, warnings: [{ code: "runtime_crash", message: "crash" }], warningCount: 1 });
    mocks.finish.mockRejectedValue(new Error("offline critic"));
    const result = await runVersionProductPostcheck(input);
    expect(result).toMatchObject({ kind: "result", result: { productBlocked: true, warningCount: 1 } });
  });
  it("expired/dead/missing lease prevents any new work", async () => {
    mocks.acquire.mockResolvedValue(null);
    expect(await runVersionProductPostcheck(input)).toEqual({ kind: "unavailable", code: "lease_unavailable" });
    expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.crawl).not.toHaveBeenCalled();
  });
});
