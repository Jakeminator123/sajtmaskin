import { describe, expect, it, vi } from "vitest";

vi.mock("./vercel-deploy", async (importOriginal) => {
  const original = await importOriginal<typeof import("./vercel-deploy")>();
  return { ...original, getVercelDeployment: vi.fn() };
});

const { waitForVercelDeploymentReady } = await import("./wait-for-deployment-ready");

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      t += ms;
    }),
  };
}

describe("waitForVercelDeploymentReady", () => {
  it("polls through BUILDING until READY", async () => {
    const states = ["QUEUED", "BUILDING", "READY"];
    const getDeployment = vi.fn(async () => ({ readyState: states.shift() ?? "READY" }));
    const c = clock();
    const outcome = await waitForVercelDeploymentReady("dpl_1", {
      getDeployment,
      sleep: c.sleep,
      now: c.now,
      intervalMs: 1000,
      timeoutMs: 60_000,
    });
    expect(outcome).toBe("ready");
    expect(getDeployment).toHaveBeenCalledTimes(3);
  });

  it("reports a failed or cancelled build so the caller can skip the backup", async () => {
    const c = clock();
    expect(
      await waitForVercelDeploymentReady("dpl_1", {
        getDeployment: async () => ({ readyState: "ERROR" }),
        sleep: c.sleep,
        now: c.now,
      }),
    ).toBe("error");
    expect(
      await waitForVercelDeploymentReady("dpl_1", {
        getDeployment: async () => ({ readyState: "CANCELED" }),
        sleep: c.sleep,
        now: c.now,
      }),
    ).toBe("cancelled");
  });

  it("times out on a build that never finishes and survives transient API errors", async () => {
    let calls = 0;
    const getDeployment = vi.fn(async () => {
      calls += 1;
      if (calls === 2) throw new Error("502");
      return { readyState: "BUILDING" };
    });
    const c = clock();
    const outcome = await waitForVercelDeploymentReady("dpl_1", {
      getDeployment,
      sleep: c.sleep,
      now: c.now,
      intervalMs: 10_000,
      timeoutMs: 35_000,
    });
    expect(outcome).toBe("timeout");
    // t=0,10,20,30 → four polls, then the next interval would pass the deadline.
    expect(getDeployment).toHaveBeenCalledTimes(4);
  });
});
