import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const select = vi.hoisted(() => vi.fn());
const run = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/chat-repository-pg", () => ({ listServerPostcheckCandidates: select }));
vi.mock("@/lib/gen/verify/server-verify", () => ({ runVersionPostchecks: run }));
import { GET, maxDuration } from "./route";

describe("unscheduled server postchecks entry", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "secret");
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    select.mockReset().mockResolvedValue([{ chatId: "c1", versionId: "v1" }, { chatId: "c2", versionId: "v2" }]);
    run.mockReset().mockResolvedValue({ kind: "stop", reason: "starting", retryable: true });
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
  const request = (auth = "Bearer secret") => new Request("https://example.com/api/engine/postchecks", { headers: { authorization: auth } });

  it.each(["", " "])("requires a nonempty secret even locally (%j)", async secret => {
    vi.stubEnv("CRON_SECRET", secret); vi.stubEnv("VERCEL_ENV", "");
    expect((await GET(request())).status).toBe(401);
    expect(select).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
  });
  it.each(["", "secret", "Bearer wrong", "Bearer secret-extra"])("rejects unauthorized credentials (%j)", async auth => {
    expect((await GET(request(auth))).status).toBe(401); expect(select).not.toHaveBeenCalled();
  });
  it("runs at most two candidates serially with the same ORIGINAL request deadline", async () => {
    let running = false;
    run.mockImplementation(async () => { expect(running).toBe(false); running = true; await Promise.resolve(); running = false; return { kind: "continue" }; });
    select.mockResolvedValue([{ chatId: "c1", versionId: "v1" }, { chatId: "c2", versionId: "v2" }, { chatId: "c3", versionId: "v3" }]);
    expect((await GET(request())).status).toBe(200);
    const deadline = 1_000 + maxDuration * 1000 - 20_000;
    expect(select).toHaveBeenCalledWith(2, deadline);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls.map(([input]) => input.deadlineEpochMs)).toEqual([deadline, deadline]);
    expect(run.mock.calls.map(([input]) => input.entry)).toEqual(["resume", "resume"]);
  });
  it("does not start another candidate after selection/previous work uses the batch budget", async () => {
    run.mockImplementationOnce(async input => { vi.mocked(Date.now).mockReturnValue(input.deadlineEpochMs); return { kind: "stop" }; });
    await GET(request()); expect(run).toHaveBeenCalledTimes(1);
  });
  it("an expired selection budget starts no candidate", async () => {
    select.mockImplementationOnce(async (_limit, deadline) => { vi.mocked(Date.now).mockReturnValue(deadline); return [{ chatId: "c", versionId: "v" }]; });
    await GET(request()); expect(run).not.toHaveBeenCalled();
  });
  it("fails closed on a selection error", async () => {
    select.mockRejectedValueOnce(new Error("database double unavailable"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await GET(request())).status).toBe(503); expect(run).not.toHaveBeenCalled();
  });
});
