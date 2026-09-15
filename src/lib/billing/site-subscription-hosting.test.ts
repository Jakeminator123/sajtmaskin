import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: { select: vi.fn() },
  dbConfigured: false,
}));
vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ VERCEL_PROJECT_ID: "prj_platform" }),
}));
vi.mock("@/lib/db/services/projects", () => ({
  getProjectById: vi.fn(),
}));

const { pickLastPublishedDeploymentRef } = await import("./site-subscription-hosting");

describe("pickLastPublishedDeploymentRef", () => {
  it("tar senaste ready-rad med live-URL och hoppar preview utan url", () => {
    expect(
      pickLastPublishedDeploymentRef([
        { vercelDeploymentId: "dpl_preview", status: "ready", url: null },
        { vercelDeploymentId: "dpl_prod", status: "READY", url: "https://kund.se" },
      ]),
    ).toBe("dpl:dpl_prod");
  });

  it("returnerar null i stället för prj-fallback när publicerad version saknas", () => {
    expect(
      pickLastPublishedDeploymentRef([
        { vercelDeploymentId: "dpl_draft", status: "building", url: null },
        { vercelDeploymentId: "dpl_ready_preview", status: "ready", url: "" },
      ]),
    ).toBeNull();
  });
});
