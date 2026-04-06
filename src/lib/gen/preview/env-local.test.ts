import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap: vi.fn(async () => ({})),
}));

import { buildPreviewEnvLocalContents, mergePreviewEnvRecords } from "./env-local";

describe("mergePreviewEnvRecords", () => {
  it("later layers override earlier keys", () => {
    const merged = mergePreviewEnvRecords(
      { A: "1", B: "from-placeholder" },
      { B: "from-project", C: "3" },
      { C: "from-generated" },
    );
    expect(merged).toEqual({
      A: "1",
      B: "from-project",
      C: "from-generated",
    });
  });
});

describe("buildPreviewEnvLocalContents", () => {
  it("includes placeholder keys and applies project map when mocked", async () => {
    const { getStoredProjectEnvVarMap } = await import("@/lib/project-env-vars");
    vi.mocked(getStoredProjectEnvVarMap).mockResolvedValueOnce({
      STRIPE_SECRET_KEY: "sk_from_project",
    });
    const body = await buildPreviewEnvLocalContents({
      appProjectId: "proj_test",
      generatedEnvLocal: "FOO=from_gen\nSTRIPE_SECRET_KEY=sk_from_model",
    });
    expect(body).toContain("FOO=from_gen");
    expect(body).toContain("STRIPE_SECRET_KEY=sk_from_model");
    expect(body).not.toContain("sk_from_project");
    expect(body).toContain("NEXT_PUBLIC_SAJTMASKIN_PROJECT_ID=proj_test");
    expect(body).toContain("SAJTMASKIN_APP_PROJECT_ID=proj_test");
  });
});
