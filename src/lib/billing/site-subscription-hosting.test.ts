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

const previewOnly = [
  {
    vercelDeploymentId: "dpl_preview",
    status: "ready",
    url: "https://kund-a1b2c3d-team.vercel.app",
  },
];

describe("pickLastPublishedDeploymentRef", () => {
  it("vägrar restore från enbart preview-/per-deployment-rad", () => {
    expect(
      pickLastPublishedDeploymentRef(previewOnly, {
        attestedProductionHost: "kund-team.vercel.app",
        verifiedCustomerHosts: ["kund.se"],
      }),
    ).toBeNull();
  });

  it("kräver bevisad produktionsidentitet, inte bara ready+url", () => {
    expect(
      pickLastPublishedDeploymentRef(
        [
          { vercelDeploymentId: "dpl_preview", status: "ready", url: "https://kund-a1b2c3d-team.vercel.app" },
          { vercelDeploymentId: "dpl_guess", status: "READY", url: "https://kund-team.vercel.app" },
        ],
        {},
      ),
    ).toBeNull();
  });

  it("godkänner exakt attesterat produktionsalias", () => {
    expect(
      pickLastPublishedDeploymentRef(
        [
          { vercelDeploymentId: "dpl_preview", status: "ready", url: "https://kund-a1b2c3d-team.vercel.app" },
          { vercelDeploymentId: "dpl_prod", status: "READY", url: "https://kund-team.vercel.app" },
        ],
        { attestedProductionHost: "kund-team.vercel.app" },
      ),
    ).toBe("dpl:dpl_prod");
  });

  it("godkänner verifierad kunddomän utanför vercel.app", () => {
    expect(
      pickLastPublishedDeploymentRef(
        [
          { vercelDeploymentId: "dpl_preview", status: "ready", url: null },
          { vercelDeploymentId: "dpl_prod", status: "READY", url: "https://kund.se" },
        ],
        { verifiedCustomerHosts: ["kund.se"] },
      ),
    ).toBe("dpl:dpl_prod");
  });

  it("returnerar null i stället för att gissa när bevis saknas", () => {
    expect(
      pickLastPublishedDeploymentRef(
        [
          { vercelDeploymentId: "dpl_draft", status: "building", url: null },
          { vercelDeploymentId: "dpl_ready_preview", status: "ready", url: "" },
        ],
        { attestedProductionHost: "kund-team.vercel.app" },
      ),
    ).toBeNull();
  });
});
