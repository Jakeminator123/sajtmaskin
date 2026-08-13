import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/projects/project-env-vars", () => ({
  getStoredProjectEnvVarMap: vi.fn(async () => ({}) as Record<string, string>),
}));

import { resolveConfiguredEnvKeys } from "./configured-env-keys";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveConfiguredEnvKeys", () => {
  it("returns the project's stored keys", async () => {
    const { getStoredProjectEnvVarMap } = await import("@/lib/projects/project-env-vars");
    vi.mocked(getStoredProjectEnvVarMap).mockResolvedValueOnce({
      OPENAI_API_KEY: "sk_real",
      RESEND_API_KEY: "re_real",
    });

    const keys = await resolveConfiguredEnvKeys("proj_1");

    expect(getStoredProjectEnvVarMap).toHaveBeenCalledWith("proj_1");
    expect([...keys].sort()).toEqual(["OPENAI_API_KEY", "RESEND_API_KEY"]);
  });

  // The whole point of the helper: `isConfigured` reads the platform
  // `process.env` when the caller passes `undefined`, which would mark a
  // dossier configured from Sajtmaskin's own keys.
  it("returns an empty set — never undefined — without a project", async () => {
    const { getStoredProjectEnvVarMap } = await import("@/lib/projects/project-env-vars");

    for (const projectId of [null, undefined, "", "   "]) {
      const keys = await resolveConfiguredEnvKeys(projectId);
      expect(keys).toBeInstanceOf(Set);
      expect(keys.size).toBe(0);
    }
    expect(getStoredProjectEnvVarMap).not.toHaveBeenCalled();
  });

  it("degrades to an empty set when the env read fails", async () => {
    const { getStoredProjectEnvVarMap } = await import("@/lib/projects/project-env-vars");
    vi.mocked(getStoredProjectEnvVarMap).mockRejectedValueOnce(new Error("db down"));

    const keys = await resolveConfiguredEnvKeys("proj_1");

    expect(keys.size).toBe(0);
  });

  it("trims the project id before reading", async () => {
    const { getStoredProjectEnvVarMap } = await import("@/lib/projects/project-env-vars");
    vi.mocked(getStoredProjectEnvVarMap).mockResolvedValueOnce({ A: "1" });

    await resolveConfiguredEnvKeys("  proj_2  ");

    expect(getStoredProjectEnvVarMap).toHaveBeenCalledWith("proj_2");
  });
});
