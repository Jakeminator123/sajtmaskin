import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap: vi.fn(async () => ({})),
}));

import {
  buildProjectEnvFileContents,
  injectProjectEnvFileIntoFilesJson,
  PROJECT_ENV_FILE_PATH,
} from "./project-env-file";

describe("buildProjectEnvFileContents", () => {
  it("includes the F2 user-facing header by default", async () => {
    const body = await buildProjectEnvFileContents({
      appProjectId: "proj_test",
      generatedEnvLocal: null,
    });
    expect(body).toContain("F2 / fidelity 2");
    expect(body).toContain('Bygg nu');
    expect(body).toContain("# ── Tier-3 placeholders");
    expect(body).toContain("# ── Säkra placeholders");
    expect(body).toContain("STRIPE_SECRET_KEY=");
    expect(body).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=");
  });

  it("strips tier-3 stub layer in F3", async () => {
    const body = await buildProjectEnvFileContents({
      appProjectId: "proj_test",
      generatedEnvLocal: null,
      lifecycleStage: "integrations",
    });
    expect(body).toContain("F3 / fidelity 3");
    expect(body).not.toContain("# ── Tier-3 placeholders");
    expect(body).not.toContain("STRIPE_SECRET_KEY=");
    expect(body).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=");
  });

  it("merges user values from the project env panel as user provenance", async () => {
    const { getStoredProjectEnvVarMap } = await import("@/lib/project-env-vars");
    vi.mocked(getStoredProjectEnvVarMap).mockResolvedValueOnce({
      KLARNA_API_SECRET: "klarna_real_secret",
    });
    const body = await buildProjectEnvFileContents({
      appProjectId: "proj_test",
      generatedEnvLocal: null,
      lifecycleStage: "integrations",
    });
    expect(body).toContain("# ── Dina ifyllda värden");
    expect(body).toContain("KLARNA_API_SECRET=klarna_real_secret");
  });
});

describe("injectProjectEnvFileIntoFilesJson", () => {
  it("appends env.example to a generated files array", async () => {
    const filesJson = JSON.stringify([
      { path: "app/page.tsx", content: "export default function Page(){}" },
    ]);
    const next = await injectProjectEnvFileIntoFilesJson(filesJson, {
      appProjectId: "proj_test",
      lifecycleStage: "design",
    });
    const parsed = JSON.parse(next) as Array<{ path: string; content: string }>;
    const envFile = parsed.find((f) => f.path === PROJECT_ENV_FILE_PATH);
    expect(envFile).toBeDefined();
    expect(envFile?.path).toBe("env.example");
    expect(envFile?.content).toContain("STRIPE_SECRET_KEY=");
  });

  it("replaces an existing env.example file rather than duplicating", async () => {
    const filesJson = JSON.stringify([
      { path: "app/page.tsx", content: "x" },
      { path: PROJECT_ENV_FILE_PATH, content: "OLD=value" },
    ]);
    const next = await injectProjectEnvFileIntoFilesJson(filesJson, {
      appProjectId: "proj_test",
      lifecycleStage: "design",
    });
    const parsed = JSON.parse(next) as Array<{ path: string; content: string }>;
    const envFiles = parsed.filter((f) => f.path === PROJECT_ENV_FILE_PATH);
    expect(envFiles.length).toBe(1);
    expect(envFiles[0]?.content).not.toContain("OLD=value");
  });

  it("strips legacy env.env carry-overs when writing the new env.example", async () => {
    const filesJson = JSON.stringify([
      { path: "app/page.tsx", content: "x" },
      { path: "env.env", content: "LEGACY=carried_over_from_old_run" },
    ]);
    const next = await injectProjectEnvFileIntoFilesJson(filesJson, {
      appProjectId: "proj_test",
      lifecycleStage: "design",
    });
    const parsed = JSON.parse(next) as Array<{ path: string; content: string }>;
    expect(parsed.find((f) => f.path === "env.env")).toBeUndefined();
    expect(parsed.find((f) => f.path === PROJECT_ENV_FILE_PATH)).toBeDefined();
  });

  it("uses generated .env.local body as the generated layer", async () => {
    const filesJson = JSON.stringify([
      { path: "app/page.tsx", content: "x" },
      { path: ".env.local", content: "MY_GEN_KEY=from_model" },
    ]);
    const next = await injectProjectEnvFileIntoFilesJson(filesJson, {
      appProjectId: "proj_test",
      lifecycleStage: "design",
    });
    const parsed = JSON.parse(next) as Array<{ path: string; content: string }>;
    const envFile = parsed.find((f) => f.path === PROJECT_ENV_FILE_PATH);
    expect(envFile?.content).toContain("MY_GEN_KEY=from_model");
    expect(envFile?.content).toContain("# ── Värden modellen själv satte");
  });

  it("returns input unchanged if filesJson is invalid", async () => {
    const bad = "not valid json";
    const next = await injectProjectEnvFileIntoFilesJson(bad, {
      appProjectId: "proj_test",
      lifecycleStage: "design",
    });
    expect(next).toBe(bad);
  });
});
