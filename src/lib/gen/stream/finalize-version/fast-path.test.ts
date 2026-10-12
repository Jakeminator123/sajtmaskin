import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCodeProject, serializeCodeProject, type CodeFile } from "@/lib/gen/parser";
import type { ScaffoldManifest } from "@/lib/gen/scaffolds";
import type { DossierEntry } from "@/lib/gen/dossiers/types";
import { runFinalizeFastPath } from "./fast-path";
import { serializeProjectCandidateForVerifier } from "../finalize-merge";
import * as projectSanity from "@/lib/gen/validation/project-sanity";
import * as finalizePreflight from "../finalize-preflight";

const runVerifierPass = vi.hoisted(() => vi.fn());
const runLlmRepairGate = vi.hoisted(() => vi.fn());
const importedRepo = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db/client", () => ({ db: {}, dbConfigured: false }));
vi.mock("@/lib/db/chat-repository-pg", () => ({
  chatHasImportedRepoVersion: importedRepo,
  getKnownBrokenImageReplacements: vi.fn(async () => []),
  getChatOrchestrationSnapshot: vi.fn(async () => null),
  getChat: vi.fn(async () => null),
  getVersionById: vi.fn(async () => null),
}));
vi.mock("@/lib/gen/verify/verifier-pass", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/gen/verify/verifier-pass")>(),
  runVerifierPass,
  isVerifierPassEnabled: () => true,
}));
vi.mock("@/lib/gen/autofix/llm-repair-gate", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/gen/autofix/llm-repair-gate")>(),
  runLlmRepairGate,
}));
vi.mock("@/lib/gen/autofix/llm-fixer", () => ({
  runLlmFixer: vi.fn(() => { throw new Error("Unexpected live fixer in offline test"); }),
}));
vi.mock("@/lib/gen/autofix/validate-and-fix", () => ({
  validateAndFix: vi.fn(async (content: string) => ({
    content, status: "passed", fixerUsed: false, llmFixCount: 0,
    errorsBefore: 0, errorsAfter: 0, tsc: null,
  })),
}));
vi.mock("@/lib/gen/retry/validate-syntax", () => ({
  validateGeneratedCode: vi.fn(async () => ({ valid: true, errors: [] })),
}));
vi.mock("@/lib/gen/post-process/image-materializer", () => ({
  materializeImages: vi.fn(async (content: string) => ({ content, replacedCount: 0 })),
}));
vi.mock("@/lib/gen/preview/build-preview-document", () => ({
  buildPreviewHtml: vi.fn(async () => "<html><body>Offline preview</body></html>"),
}));
vi.mock("@/lib/logging/dev-log", () => ({ devLogAppend: vi.fn() }));
vi.mock("@/lib/logging/error-log-rag", () => ({ appendErrorLogEvent: vi.fn() }));

const file = (path: string, content: string, language = "tsx"): CodeFile => ({ path, content, language });
const page = file("app/page.tsx", `import { getTitle } from "@/lib/base";
export default function Page(){ return <main><section><h1>{getTitle()}</h1><p>A complete, original candidate with useful explanatory content and a visible call to action for visitors.</p><a href="/contact">Contact our team for a conversation</a></section></main>; }`);
const layout = file("app/layout.tsx", `export const metadata = { title: "Candidate fixture", description: "Offline candidate integration fixture" };
export default function Layout({ children }: { children: React.ReactNode }){ return <html lang="sv"><body>{children}</body></html>; }`);
const base = file("lib/base.ts", 'export function getTitle(){ return "A complete candidate"; }', "ts");
const globals = file("app/globals.css", "@import 'tailwindcss';", "css");
const pkg = file("package.json", JSON.stringify({
  name: "candidate", dependencies: { next: "14.2.0", react: "18.3.1", "react-dom": "18.3.1", sonner: "^2.0.0" },
  scripts: { dev: "next dev", build: "next build" },
}), "json");
const env = file(".env.production", "PRIVATE_TOKEN=fixture-private-token\nPUBLIC_URL=https://fixture-private-url.invalid", "env");

function scaffold(): ScaffoldManifest {
  return {
    id: "candidate-fixture", label: "Candidate", description: "Offline", version: "1",
    siteKind: "landing-page", features: [], promptHints: [],
    files: [layout, globals, base, file("app/page.tsx", "export default function Page(){ return <h1>Unclaimed scaffold brand</h1>; }")],
  } as unknown as ScaffoldManifest;
}

function params(mode: "init" | "followup" | "imported") {
  return {
    chatId: `candidate-${mode}`, model: "offline", resolvedTier: "max" as const,
    resolvedScaffold: mode === "init" ? scaffold() : null,
    previousFiles: mode === "init" ? undefined : [page, layout, globals, base, pkg, env],
    previousSelectedDossierEnvKeys: [],
    contentForVersion: serializeCodeProject([page]),
    finalizePath: { runDeepPath: true, reason: "default" } as const,
    repairPassIndex: 0, alreadyMechanicallyFixed: true,
    willRunQualityGate: false, qualityGateChecksIncludesTypecheck: false,
    repairScopeId: `candidate-${mode}`,
  };
}

beforeEach(() => {
  runVerifierPass.mockReset().mockResolvedValue({ blocking: [], quality: [], llmAvailability: "completed" });
  runLlmRepairGate.mockReset().mockImplementation(() => { throw new Error("Unexpected repair in offline fixture"); });
  importedRepo.mockReset().mockResolvedValue(false);
});

describe("complete candidate before semantic verification", () => {
  it.each(["init", "followup", "imported"] as const)("verifies the final %s project including base files and dependencies", async (mode) => {
    importedRepo.mockResolvedValue(mode === "imported");
    const outcome = await runFinalizeFastPath(params(mode));
    const persisted = JSON.parse(outcome.filesJson) as CodeFile[];
    const judged = parseCodeProject(String(runVerifierPass.mock.calls[0]?.[0])).files;
    expect(judged).toContainEqual(expect.objectContaining({ path: "lib/base.ts", content: base.content }));
    const judgedPkg = JSON.parse(judged.find((item) => item.path === "package.json")!.content);
    const persistedPkg = JSON.parse(persisted.find((item) => item.path === "package.json")!.content);
    expect(judgedPkg).toEqual(persistedPkg);
    expect(judgedPkg.dependencies.next).toBeDefined();
    if (mode === "imported") expect(judgedPkg.dependencies.next).toBe("14.2.0");
    expect(String(runVerifierPass.mock.calls[0]?.[0])).toBe(serializeProjectCandidateForVerifier(persisted));
    expect(String(runVerifierPass.mock.calls[0]?.[0])).not.toContain("fixture-private");
    expect(outcome.verifierBlockingFindings).toEqual([]);
    expect(runLlmRepairGate).not.toHaveBeenCalled();
  });

  it("reprepares an LLM repair and persists exactly its confirmed candidate without exposing env values", async () => {
    importedRepo.mockResolvedValue(true);
    runVerifierPass.mockResolvedValueOnce({
      blocking: [{ id: "semantic-fixture", detail: "lib/base.ts should say Repaired candidate." }], quality: [], llmAvailability: "completed",
    });
    runLlmRepairGate.mockImplementationOnce(async ({ content, ledger, scopeId }) => {
      expect(content).not.toContain("fixture-private");
      expect(ledger).toBeDefined();
      expect(scopeId).toBe("candidate-imported");
      return { result: { success: true, fixedContent: content.replace("A complete candidate", "Repaired candidate"), partial: false }, fixerModel: "offline" };
    });
    const outcome = await runFinalizeFastPath(params("imported"));
    const persisted = JSON.parse(outcome.filesJson) as CodeFile[];
    const confirmed = parseCodeProject(String(runVerifierPass.mock.calls[1]?.[0])).files;
    expect(String(runVerifierPass.mock.calls[1]?.[0])).toBe(serializeProjectCandidateForVerifier(persisted));
    expect(confirmed.find((item) => item.path === "lib/base.ts")?.content).toContain("Repaired candidate");
    expect(persisted.find((item) => item.path === "lib/base.ts")).toEqual(confirmed.find((item) => item.path === "lib/base.ts"));
    expect(persisted.find((item) => item.path === ".env.production")?.content).toContain("fixture-private-token");
    expect(String(runVerifierPass.mock.calls[1]?.[0])).not.toContain("fixture-private");
    expect(runVerifierPass).toHaveBeenCalledTimes(2);
    expect(importedRepo).toHaveBeenCalledTimes(1);
    expect(outcome.verifierBlockingFindings).toEqual([]);
  });

  it("invalidates the raw safe-only skip when project preparation changes the candidate", async () => {
    const outcome = await runFinalizeFastPath({
      ...params("init"),
      autoFixRisk: { safeFixCount: 1, riskyFixCount: 0, riskyFixerIds: [] },
    });
    expect(runVerifierPass).toHaveBeenCalledTimes(1);
    expect(String(runVerifierPass.mock.calls[0]?.[0])).toBe(
      serializeProjectCandidateForVerifier(JSON.parse(outcome.filesJson) as CodeFile[]),
    );
  });

  it("preserves original env bytes when partial-file repair echoes the redacted complete candidate", async () => {
    // Trigger the partial-file lane; its repair owner, merge and assembly are real.
    const sanity = vi.spyOn(projectSanity, "runProjectSanityChecks").mockReturnValueOnce({
      valid: false, unresolvedImportFallbackUsed: false,
      issues: [{ file: page.path, severity: "error", category: "code_structure_failure", message: "File excerpt instead of a complete file." }],
    });
    // An authoritative artifact created during preparation must not revert to
    // the older scaffold value when the repaired model view is parsed again.
    const preparedEnv = { ...env, content: env.content.replace("fixture-private-token", "fixture-private-prepared-token") };
    const prepare = finalizePreflight.runFinalizePreflight;
    const preparation = vi.spyOn(finalizePreflight, "runFinalizePreflight").mockImplementationOnce(async (input) => {
      const outcome = await prepare(input);
      return { ...outcome, filesJson: JSON.stringify((JSON.parse(outcome.filesJson) as CodeFile[]).map((item) =>
        item.path === env.path ? { ...item, content: preparedEnv.content } : item,
      )) };
    });
    runLlmRepairGate.mockImplementationOnce(async ({ content, phase }) => {
      expect(phase).toBe("partial-file");
      expect(content).toContain("PRIVATE_TOKEN=");
      expect(content).not.toContain("fixture-private");
      return { result: { success: true, fixedContent: content.replace("A complete, original candidate", "Complete repaired component"), partial: false }, fixerModel: "offline" };
    });
    const initScaffold = scaffold();
    try {
      const outcome = await runFinalizeFastPath({
        ...params("init"),
        resolvedScaffold: { ...initScaffold, files: [...initScaffold.files, env] },
      });
      const persisted = JSON.parse(outcome.filesJson) as CodeFile[];
      expect(runLlmRepairGate).toHaveBeenCalledTimes(1);
      expect(persisted.find((item) => item.path === env.path)?.content).toBe(preparedEnv.content);
      expect(persisted.find((item) => item.path === page.path)?.content).toContain("Complete repaired component");
      expect(String(runVerifierPass.mock.calls[0]?.[0])).not.toContain("fixture-private");
      expect(String(runVerifierPass.mock.calls[0]?.[0])).toBe(serializeProjectCandidateForVerifier(persisted));
    } finally {
      sanity.mockRestore();
      preparation.mockRestore();
    }
  });

  it("latches unknown import mode fail-closed instead of contaminating the manifest on repair", async () => {
    importedRepo.mockRejectedValueOnce(new Error("offline lookup failed"));
    const outcome = await runFinalizeFastPath(params("imported"));
    const persisted = JSON.parse(outcome.filesJson) as CodeFile[];
    expect(JSON.parse(persisted.find((item) => item.path === "package.json")!.content).dependencies.next).toBe("14.2.0");
    expect(importedRepo).toHaveBeenCalledTimes(1);
    expect(runLlmRepairGate).not.toHaveBeenCalled();
  });

  it("does not reactivate a removed dossier echoed back by semantic repair", async () => {
    importedRepo.mockResolvedValue(true);
    const retired = file("components/retired.ts", "export const retired = true;", "ts");
    const removed = { id: "retired", class: "soft", capability: "retired", codeFidelity: "rewritable", files: [{ path: retired.path, role: "shared" }] } as unknown as DossierEntry;
    runVerifierPass.mockResolvedValueOnce({ blocking: [{ id: "semantic-fixture", detail: "Repair the title." }], quality: [], llmAvailability: "completed" });
    runLlmRepairGate.mockImplementationOnce(async ({ content }) => ({
      result: { success: true, fixedContent: `${content.replace("A complete candidate", "Repaired candidate")}\n\n${serializeCodeProject([retired])}`, partial: false }, fixerModel: "offline",
    }));
    const input = params("imported");
    const outcome = await runFinalizeFastPath({ ...input, previousFiles: [...input.previousFiles!, retired], removedDossiers: [removed] });
    expect((JSON.parse(outcome.filesJson) as CodeFile[]).some((item) => item.path === retired.path)).toBe(false);
    expect(String(runVerifierPass.mock.calls[1]?.[0])).not.toContain(retired.path);
    expect(outcome.verifierBlockingFindings).toEqual([]);
  });
});
