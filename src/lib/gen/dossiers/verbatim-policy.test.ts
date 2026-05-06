/**
 * Unit tests for applyDossierVerbatimPolicy.
 *
 * All disk I/O is mocked — no `data/dossiers/` directory needed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Must mock before importing the module under test.
// Vitest v4 syntax: single type-arg is the full function signature.
const mockGetDossierFileContent =
  vi.fn<(klass: string, id: string, relPath: string) => string | null>();
vi.mock("./registry", () => ({
  getDossierFileContent: (...args: [string, string, string]) =>
    mockGetDossierFileContent(...args),
}));

const mockDevLogAppend = vi.fn();
vi.mock("@/lib/logging/devLog", () => ({
  devLogAppend: (...args: unknown[]) => mockDevLogAppend(...args),
}));

import { applyDossierVerbatimPolicy } from "./verbatim-policy";
import type { DossierEntry } from "./types";
import type { CodeFile } from "@/lib/gen/parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVerbatimDossier(overrides: Partial<DossierEntry> = {}): DossierEntry {
  return {
    class: "hard",
    id: "test-dossier",
    label: "Test Dossier",
    capability: "payments",
    codeFidelity: "verbatim",
    complexity: "simple",
    defaultForCapability: true,
    summary: "Test dossier for verbatim policy tests.",
    lastVerified: "2026-01-01",
    files: [{ path: "components/checkout-button.tsx", role: "client" }],
    ...overrides,
  };
}

function makeFile(path: string, content: string): CodeFile {
  return { path, content, language: "tsx" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("applyDossierVerbatimPolicy", () => {
  describe("verbatim_content_drift — LLM modified a verbatim file", () => {
    it("restores content from canonical when LLM changed it", () => {
      const canonical = "export default function CheckoutButton() { return <button>Pay</button>; }";
      mockGetDossierFileContent.mockReturnValue(canonical);

      const dossier = makeVerbatimDossier();
      const llmFile = makeFile("components/checkout-button.tsx", "// LLM rewrote me");
      const { files, restored } = applyDossierVerbatimPolicy({
        llmFiles: [llmFile],
        selectedDossiers: [dossier],
        chatId: "chat-1",
      });

      expect(restored).toHaveLength(1);
      expect(restored[0].reason).toBe("verbatim_content_drift");
      expect(restored[0].path).toBe("components/checkout-button.tsx");
      expect(restored[0].dossierId).toBe("test-dossier");

      const outputFile = files.find((f) => f.path === "components/checkout-button.tsx");
      expect(outputFile?.content).toBe(canonical);
    });

    it("does NOT restore when LLM content matches canonical exactly", () => {
      const canonical = "export default function CheckoutButton() {}";
      mockGetDossierFileContent.mockReturnValue(canonical);

      const dossier = makeVerbatimDossier();
      const llmFile = makeFile("components/checkout-button.tsx", canonical);
      const { restored } = applyDossierVerbatimPolicy({
        llmFiles: [llmFile],
        selectedDossiers: [dossier],
      });

      expect(restored).toHaveLength(0);
    });

    it("restores a corrupted ThreeCanvasShell wrapper back to the canonical dossier file", () => {
      const canonical = '"use client";\nexport function ThreeCanvasShell() { return null; }\n';
      mockGetDossierFileContent.mockReturnValue(canonical);

      const dossier = makeVerbatimDossier({
        class: "soft",
        id: "three-fiber-canvas",
        capability: "visual-3d",
        files: [
          {
            path: "components/three-canvas-shell.tsx",
            role: "client",
            injectionMode: "verbatim",
          },
        ],
      });
      const llmFile = makeFile(
        "components/three-canvas-shell.tsx",
        '"use client";\nimport type { ReactNode } from "react";\nimport { type ReactNode } from "react";\n',
      );

      const { files, restored } = applyDossierVerbatimPolicy({
        llmFiles: [llmFile],
        selectedDossiers: [dossier],
        chatId: "chat-3d",
      });

      expect(restored).toEqual([
        {
          path: "components/three-canvas-shell.tsx",
          dossierId: "three-fiber-canvas",
          reason: "verbatim_content_drift",
        },
      ]);
      expect(files.find((f) => f.path === "components/three-canvas-shell.tsx")?.content).toBe(canonical);
    });
  });

  describe("verbatim_file_missing_in_llm_output — LLM omitted a verbatim file", () => {
    it("pushes the canonical file at app/api/<route> when LLM did not emit it", () => {
      const canonical = "export default function WebhookHandler() {}";
      mockGetDossierFileContent.mockReturnValue(canonical);

      const dossier = makeVerbatimDossier({
        files: [{ path: "components/api/webhook/route.ts", role: "server" }],
      });
      const { files, restored } = applyDossierVerbatimPolicy({
        llmFiles: [],
        selectedDossiers: [dossier],
        chatId: "chat-2",
      });

      expect(restored).toHaveLength(1);
      expect(restored[0].reason).toBe("verbatim_file_missing_in_llm_output");
      // API routes belong under app/api/<route>/route.ts in the user project.
      expect(restored[0].path).toBe("app/api/webhook/route.ts");

      const pushed = files.find((f) => f.path === "app/api/webhook/route.ts");
      expect(pushed).toBeDefined();
      expect(pushed?.content).toBe(canonical);
      expect(pushed?.language).toBe("ts");
    });

    it("detects language from extension correctly", () => {
      mockGetDossierFileContent.mockReturnValue("body { margin: 0; }");
      const dossier = makeVerbatimDossier({
        files: [{ path: "components/style.css", role: "shared" }],
      });
      const { files } = applyDossierVerbatimPolicy({
        llmFiles: [],
        selectedDossiers: [dossier],
      });
      expect(files[0]?.language).toBe("css");
    });
  });

  describe("rewritable files are not touched", () => {
    it("ignores files with effective injectionMode 'rewritable'", () => {
      mockGetDossierFileContent.mockReturnValue("canonical content");

      const dossier = makeVerbatimDossier({
        codeFidelity: "rewritable",
        files: [{ path: "components/hero.tsx", role: "client" }],
      });
      const llmContent = "LLM-rewritten hero content";
      const llmFile = makeFile("components/hero.tsx", llmContent);
      const { files, restored } = applyDossierVerbatimPolicy({
        llmFiles: [llmFile],
        selectedDossiers: [dossier],
      });

      expect(restored).toHaveLength(0);
      const hero = files.find((f) => f.path === "components/hero.tsx");
      expect(hero?.content).toBe(llmContent); // LLM version untouched
    });

    it("per-file injectionMode 'rewritable' overrides dossier verbatim default", () => {
      mockGetDossierFileContent.mockReturnValue("canonical content");

      const dossier = makeVerbatimDossier({
        codeFidelity: "verbatim",
        files: [
          {
            path: "components/checkout-button.tsx",
            role: "client",
            injectionMode: "rewritable",
          },
        ],
      });
      const llmContent = "LLM adapted content";
      const { restored } = applyDossierVerbatimPolicy({
        llmFiles: [makeFile("components/checkout-button.tsx", llmContent)],
        selectedDossiers: [dossier],
      });

      expect(restored).toHaveLength(0);
    });

    it("per-file injectionMode 'verbatim' overrides dossier rewritable default", () => {
      const canonical = "original canonical content";
      mockGetDossierFileContent.mockReturnValue(canonical);

      const dossier = makeVerbatimDossier({
        codeFidelity: "rewritable",
        files: [
          {
            path: "components/middleware.ts",
            role: "server",
            injectionMode: "verbatim",
          },
        ],
      });
      const { restored } = applyDossierVerbatimPolicy({
        // middleware.ts lands at root in the user project (Next.js convention).
        llmFiles: [makeFile("middleware.ts", "// LLM modified middleware")],
        selectedDossiers: [dossier],
      });

      expect(restored).toHaveLength(1);
      expect(restored[0].reason).toBe("verbatim_content_drift");
      expect(restored[0].path).toBe("middleware.ts");
    });
  });

  describe("getDossierFileContent returning null — safety skip", () => {
    it("skips restoration when canonical content cannot be read", () => {
      mockGetDossierFileContent.mockReturnValue(null);

      const dossier = makeVerbatimDossier();
      const llmContent = "LLM modified content";
      const { files, restored } = applyDossierVerbatimPolicy({
        llmFiles: [makeFile("components/checkout-button.tsx", llmContent)],
        selectedDossiers: [dossier],
      });

      expect(restored).toHaveLength(0);
      expect(files[0].content).toBe(llmContent); // unchanged
    });
  });

  describe("devLogAppend telemetry", () => {
    it("calls devLogAppend when restorations occur and chatId is present", () => {
      mockGetDossierFileContent.mockReturnValue("canonical");
      const dossier = makeVerbatimDossier();
      applyDossierVerbatimPolicy({
        llmFiles: [makeFile("components/checkout-button.tsx", "different")],
        selectedDossiers: [dossier],
        chatId: "chat-telemetry",
      });

      expect(mockDevLogAppend).toHaveBeenCalledOnce();
      const [phase, payload] = mockDevLogAppend.mock.calls[0];
      expect(phase).toBe("in-progress");
      expect(payload.type).toBe("dossier_verbatim_restored");
      expect(payload.chatId).toBe("chat-telemetry");
      expect(payload.count).toBe(1);
    });

    it("does NOT call devLogAppend when no restorations occur", () => {
      mockGetDossierFileContent.mockReturnValue("same content");
      const dossier = makeVerbatimDossier();
      applyDossierVerbatimPolicy({
        llmFiles: [makeFile("components/checkout-button.tsx", "same content")],
        selectedDossiers: [dossier],
        chatId: "chat-no-op",
      });

      expect(mockDevLogAppend).not.toHaveBeenCalled();
    });

    it("does NOT call devLogAppend when chatId is absent", () => {
      mockGetDossierFileContent.mockReturnValue("canonical");
      const dossier = makeVerbatimDossier();
      applyDossierVerbatimPolicy({
        llmFiles: [makeFile("components/checkout-button.tsx", "different")],
        selectedDossiers: [dossier],
        // chatId omitted
      });

      expect(mockDevLogAppend).not.toHaveBeenCalled();
    });
  });

  describe("empty inputs", () => {
    it("returns empty files and no restorations for empty dossier list", () => {
      const { files, restored } = applyDossierVerbatimPolicy({
        llmFiles: [makeFile("app/page.tsx", "content")],
        selectedDossiers: [],
      });
      expect(restored).toHaveLength(0);
      expect(files).toHaveLength(1);
    });

    it("handles dossier with no files array", () => {
      const dossier = makeVerbatimDossier({ files: undefined });
      const { restored } = applyDossierVerbatimPolicy({
        llmFiles: [],
        selectedDossiers: [dossier],
      });
      expect(restored).toHaveLength(0);
    });
  });
});
