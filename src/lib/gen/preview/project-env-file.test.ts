import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/project-env-vars", () => ({
  getStoredProjectEnvVarMap: vi.fn(async () => ({})),
}));

import {
  buildProjectEnvFileContents,
  injectProjectEnvFileIntoFilesJson,
  PROJECT_ENV_FILE_PATH,
} from "./project-env-file";
import { PIPELINE_ENV_LOCAL_MARKER } from "./env-local";

describe("buildProjectEnvFileContents", () => {
  // NOTE (scope-env-example wave 1): these two tests exercise the LEGACY
  // full-catalog dump, which is now only reached when NO `dossierEnvScope` is
  // passed (unknown/older callsites). The real pipeline (preflight-phase.ts)
  // always passes a scope, so the STRIPE_SECRET_KEY-in-F2-default pin below
  // describes the fallback, not the production path — the dossier-scoped path
  // is pinned in the "dossier-scoped env.example" describe block.
  it("includes the F2 user-facing header by default (legacy full-dump fallback)", async () => {
    const body = await buildProjectEnvFileContents({
      appProjectId: "proj_test",
      generatedEnvLocal: null,
    });
    expect(body).toContain("F2 / fidelity 2");
    expect(body).toContain("Bygg integrationer");
    expect(body).toContain("# ── Tier-3 placeholders");
    expect(body).toContain("# ── Säkra placeholders");
    expect(body).toContain("STRIPE_SECRET_KEY=");
    expect(body).toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=");
  });

  it("strips tier-3 stub layer in F3 (legacy full-dump fallback)", async () => {
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

  it("groups detected email-recipient keys under an email heading with a hint", async () => {
    const body = await buildProjectEnvFileContents({
      appProjectId: "proj_test",
      generatedEnvLocal: null,
      lifecycleStage: "design",
      projectFiles: [
        {
          path: "app/api/booking/route.ts",
          content:
            "const to = process.env.BOOKING_TO_EMAIL;\nconst from = process.env.BOOKING_FROM_EMAIL;\nconst misc = process.env.MY_RANDOM_KEY;",
        },
      ],
    });
    expect(body).toContain("Upptäckta integrationer");
    // Email-recipient keys get the dedicated heading + a "do I need these?" hint...
    expect(body).toContain("E-post (kontakt-/bokningsformulär)");
    expect(body).toContain("# BOOKING_TO_EMAIL=");
    expect(body).toContain("# BOOKING_FROM_EMAIL=");
    expect(body).toContain("email-not-configured");
    // ...while non-email custom keys stay in the generic bucket.
    expect(body).toContain("# MY_RANDOM_KEY=");
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

  it("skips the pipeline-authored placeholder .env.local as the generated layer (F3)", async () => {
    // Regression pin (prod 2026-07-09, chat 7e8f51e0…): the scaffold merge
    // injects a FULL-catalog placeholder `.env.local` into every version's
    // files. On the next regeneration that file must NOT be read back as the
    // "generated" (model-authored) layer — "generated" keys always survive
    // dossier scoping, so the entire catalog laundered itself into the
    // F3 env.example ("Tier-3-stubbar är bortskalade" + 57 placeholder rows).
    const pipelineEnvLocal = [
      PIPELINE_ENV_LOCAL_MARKER,
      "# Same keys as tier-2 preview runtime; override with real values when deploying.",
      "",
      "CONTENTFUL_ACCESS_TOKEN=placeholder_cda_token",
      "STRIPE_SECRET_KEY=sk_test_placeholder_preview_not_real",
    ].join("\n");
    const filesJson = JSON.stringify([
      { path: "app/page.tsx", content: "x" },
      { path: ".env.local", content: pipelineEnvLocal },
    ]);
    const next = await injectProjectEnvFileIntoFilesJson(filesJson, {
      appProjectId: "proj_test",
      lifecycleStage: "integrations",
      dossierEnvScope: {
        envVars: [{ key: "OPENAI_API_KEY", purpose: "OpenAI API key" }],
      },
    });
    const parsed = JSON.parse(next) as Array<{ path: string; content: string }>;
    const envFile = parsed.find((f) => f.path === PROJECT_ENV_FILE_PATH);
    expect(envFile?.content).toContain("OPENAI_API_KEY");
    // The catalog keys from the pipeline-authored file must NOT leak through
    // as "model-set" values.
    expect(envFile?.content).not.toContain("CONTENTFUL_ACCESS_TOKEN=");
    expect(envFile?.content).not.toContain("STRIPE_SECRET_KEY=");
    expect(envFile?.content).not.toContain("# ── Värden modellen själv satte");
  });

  it("skips the pipeline-authored placeholder .env.local in F2 too (dossier-scoped)", async () => {
    const pipelineEnvLocal = [
      PIPELINE_ENV_LOCAL_MARKER,
      "CONTENTFUL_ACCESS_TOKEN=placeholder_cda_token",
    ].join("\n");
    const filesJson = JSON.stringify([{ path: ".env.local", content: pipelineEnvLocal }]);
    const next = await injectProjectEnvFileIntoFilesJson(filesJson, {
      appProjectId: "proj_test",
      lifecycleStage: "design",
      dossierEnvScope: { envVars: [] },
    });
    const parsed = JSON.parse(next) as Array<{ path: string; content: string }>;
    const envFile = parsed.find((f) => f.path === PROJECT_ENV_FILE_PATH);
    // Not as a VALUE line under the generated section. (An F2 "detected
    // integrations" comment `# KEY=` would be a different, commented shape.)
    expect(envFile?.content).not.toContain("\nCONTENTFUL_ACCESS_TOKEN=");
    expect(envFile?.content).not.toContain("# ── Värden modellen själv satte");
  });

  it("falls through to a model-emitted env file when the pipeline .env.local is skipped", async () => {
    // `.env.local` carries the pipeline marker (skipped); the model's own
    // `.env` must still be picked up as the generated layer.
    const pipelineEnvLocal = [
      PIPELINE_ENV_LOCAL_MARKER,
      "STRIPE_SECRET_KEY=sk_test_placeholder_preview_not_real",
    ].join("\n");
    const filesJson = JSON.stringify([
      { path: ".env.local", content: pipelineEnvLocal },
      { path: ".env", content: "MY_GEN_KEY=from_model" },
    ]);
    const next = await injectProjectEnvFileIntoFilesJson(filesJson, {
      appProjectId: "proj_test",
      // F3 so the F2 "detected integrations" comment block (which may echo
      // key names from project files) stays out of the assertion surface.
      lifecycleStage: "integrations",
      dossierEnvScope: { envVars: [] },
    });
    const parsed = JSON.parse(next) as Array<{ path: string; content: string }>;
    const envFile = parsed.find((f) => f.path === PROJECT_ENV_FILE_PATH);
    expect(envFile?.content).toContain("MY_GEN_KEY=from_model");
    expect(envFile?.content).not.toContain("STRIPE_SECRET_KEY=");
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

describe("buildProjectEnvFileContents — dossier-scoped env.example (wave 1)", () => {
  it("drops the full placeholder catalog when the scope is empty", async () => {
    // Site with no dossiers: env.example should no longer dump Stripe/Supabase
    // etc. just because the catalogs contain them.
    const body = await buildProjectEnvFileContents({
      appProjectId: "proj_test",
      generatedEnvLocal: null,
      lifecycleStage: "design",
      dossierEnvScope: { envVars: [] },
    });
    expect(body).not.toContain("STRIPE_SECRET_KEY=");
    expect(body).not.toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=");
    // Project-preview tokens are project-specific and always kept.
    expect(body).toContain("# ── Stabila projekt-tokens");
  });

  it("emits only the catalog keys a selected dossier declares", async () => {
    const body = await buildProjectEnvFileContents({
      appProjectId: "proj_test",
      generatedEnvLocal: null,
      lifecycleStage: "design",
      dossierEnvScope: {
        envVars: [
          { key: "STRIPE_SECRET_KEY", purpose: "Stripe secret" },
          { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", purpose: "Stripe publishable" },
        ],
      },
    });
    // Both are covered by the catalogs → keep their placeholder VALUE.
    expect(body).toMatch(/STRIPE_SECRET_KEY=.+/);
    expect(body).toMatch(/NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=.+/);
  });

  // Våg 2: an uncovered dossier key now shows a DEMO VALUE in F2 (so the
  // downloaded env.example documents the stub the preview boots with) instead
  // of the old empty line. F3 keeps the empty line (see the F3 test below).
  it("lists an uncovered dossier key with a demo value + its purpose in F2", async () => {
    const body = await buildProjectEnvFileContents({
      appProjectId: "proj_test",
      generatedEnvLocal: null,
      lifecycleStage: "design",
      dossierEnvScope: {
        envVars: [{ key: "MY_DOSSIER_ONLY_KEY", purpose: "Bespoke integration token" }],
      },
    });
    expect(body).toContain("Nycklar för valda byggblock");
    expect(body).toContain("# Bespoke integration token");
    // Demo value embeds the stub vocabulary (placeholder + not_real).
    expect(body).toContain("MY_DOSSIER_ONLY_KEY=my_dossier_only_key_placeholder_preview_not_real");
    // The demo value must classify as a stub (never real integration evidence).
    const { isLikelyStubEnvValue } = await import("@/lib/integrations/stub-env-filter");
    expect(isLikelyStubEnvValue("my_dossier_only_key_placeholder_preview_not_real")).toBe(true);
  });

  it("lists an uncovered dossier key as an empty line in F3 (real value required)", async () => {
    const body = await buildProjectEnvFileContents({
      appProjectId: "proj_test",
      generatedEnvLocal: null,
      lifecycleStage: "integrations",
      dossierEnvScope: {
        envVars: [{ key: "MY_DOSSIER_ONLY_KEY", purpose: "Bespoke integration token" }],
      },
    });
    expect(body).toContain("# Bespoke integration token");
    expect(body).toMatch(/MY_DOSSIER_ONLY_KEY=\s*$/m);
    expect(body).not.toContain("_placeholder_preview_not_real");
  });

  it("in F3 a stripped tier-3 dossier key surfaces empty; harmless keys keep values", async () => {
    const body = await buildProjectEnvFileContents({
      appProjectId: "proj_test",
      generatedEnvLocal: null,
      lifecycleStage: "integrations",
      dossierEnvScope: {
        envVars: [
          { key: "STRIPE_SECRET_KEY", purpose: "Stripe secret" },
          { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", purpose: "Stripe publishable" },
        ],
      },
    });
    // Tier-3 stub layer is stripped in F3 → the secret has no placeholder and
    // moves to the "fill me" dossier section as an empty line.
    expect(body).not.toContain("# ── Tier-3 placeholders");
    expect(body).toContain("Nycklar för valda byggblock");
    expect(body).toMatch(/STRIPE_SECRET_KEY=\s*$/m);
    // Harmless publishable key stays with its (safe) placeholder value.
    expect(body).toMatch(/NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=.+/);
  });

  it("keeps user-stored values even for out-of-scope keys", async () => {
    const { getStoredProjectEnvVarMap } = await import("@/lib/project-env-vars");
    vi.mocked(getStoredProjectEnvVarMap).mockResolvedValueOnce({
      KLARNA_API_SECRET: "klarna_real_secret",
    });
    const body = await buildProjectEnvFileContents({
      appProjectId: "proj_test",
      generatedEnvLocal: null,
      lifecycleStage: "design",
      dossierEnvScope: { envVars: [] },
    });
    // User-panel values are project-specific and always kept, regardless of scope.
    expect(body).toContain("KLARNA_API_SECRET=klarna_real_secret");
  });
});
