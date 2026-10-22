import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPostcheckRecovery } from "./postcheck-recovery";

describe("builder postcheck wakeup", () => {
  const NOW = Date.UTC(2026, 9, 22);
  const row = (delta: Record<string, unknown> = {}) => ({ id: "v1", versionNumber: 1,
    createdAt: new Date(NOW - 360_000).toISOString(), releaseState: "draft", verificationState: "pending",
    lifecycleStage: "design", editKind: null, hasPendingRepair: false, ...delta });
  const fetcher = vi.fn();
  beforeEach(() => { vi.spyOn(Date, "now").mockReturnValue(NOW); fetcher.mockReset().mockResolvedValue(new Response(null, { status: 202 })); vi.stubGlobal("fetch", fetcher); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("wakes a late version after page reopen; the request contains only its ID", async () => {
    await createPostcheckRecovery("chat")({ versions: [row()] });
    expect(fetcher).toHaveBeenCalledWith("/api/engine/chats/chat/postchecks", expect.objectContaining({ method: "POST", body: '{"versionId":"v1"}' }));
  });
  it.each([
    { verificationState: "passed" }, { verificationState: "failed" }, { releaseState: "promoted" },
    { editKind: "quick_edit" }, { editKind: "restore" }, { lifecycleStage: "integrations" },
    { hasPendingRepair: true }, { createdAt: new Date(NOW - 30_000).toISOString() },
    { createdAt: new Date(NOW - 8 * 86400_000).toISOString() }, { createdAt: "unknown" },
    { versionNumber: undefined },
  ])("does not wake an ineligible row %j", async delta => {
    await createPostcheckRecovery("chat")({ versions: [row(delta)] }); expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not fall back to an old pending version behind a newer terminal head", async () => {
    await createPostcheckRecovery("chat")({ versions: [row(), row({ id: "v2", versionNumber: 2, verificationState: "passed" })] });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("bounds retries across successful polls, including failed HTTP/network requests", async () => {
    const wake = createPostcheckRecovery("chat"); const payload = { versions: [row()] };
    fetcher.mockRejectedValueOnce(new Error("offline"));
    await wake(payload); await wake(payload); expect(fetcher).toHaveBeenCalledTimes(1);
    vi.mocked(Date.now).mockReturnValue(NOW + 60_000); await wake(payload);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not overlap an outstanding wakeup even after the cooldown", async () => {
    let resolve!: (value: Response) => void;
    fetcher.mockReturnValueOnce(new Promise<Response>(r => { resolve = r; }));
    const wake = createPostcheckRecovery("chat"); const first = wake({ versions: [row()] });
    vi.mocked(Date.now).mockReturnValue(NOW + 60_000); await wake({ versions: [row()] });
    expect(fetcher).toHaveBeenCalledTimes(1); resolve(new Response()); await first;
  });
});
