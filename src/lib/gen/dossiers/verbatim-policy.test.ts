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
  getDossierFileContent: (...args: [string, string, string]) => mockGetDossierFileContent(...args),
}));

const mockDevLogAppend = vi.fn();
vi.mock("@/lib/logging/dev-log", () => ({
  devLogAppend: (...args: unknown[]) => mockDevLogAppend(...args),
}));

import {
  applyDossierVerbatimPolicy,
  assertCompatibleDossierOutputClaims,
  assertPreservedDossierVerbatimFiles,
  capturePreservedDossierVerbatimSnapshot,
  restorePreservedDossierVerbatimFiles,
} from "./verbatim-policy";
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

    it("canonicalizes a case-only dossier-owned output alias even when bytes already match", () => {
      const canonical = "export const value = 1;";
      mockGetDossierFileContent.mockReturnValue(canonical);
      const dossier = makeVerbatimDossier({
        files: [{ path: "components/Foo.ts", role: "shared" }],
      });
      const llmFile = makeFile("components/foo.ts", canonical);
      const { files, restored } = applyDossierVerbatimPolicy({
        llmFiles: [llmFile],
        selectedDossiers: [dossier],
      });
      expect(files).toHaveLength(1);
      expect(files[0]?.path).toBe("components/Foo.ts");
      expect(files[0]?.content).toBe(canonical);
      expect(restored).toHaveLength(0);
    });

    it("canonicalizes a present rewritable alias without replacing its content", () => {
      mockGetDossierFileContent.mockReturnValue("canonical seed");
      const dossier = makeVerbatimDossier({
        codeFidelity: "rewritable",
        files: [{ path: "components/Foo.ts", role: "shared", injectionMode: "rewritable" }],
      });
      const llmFile = makeFile("components/foo.ts", "LLM-owned content");
      const { files, restored } = applyDossierVerbatimPolicy({
        llmFiles: [llmFile],
        selectedDossiers: [dossier],
      });
      expect(files).toEqual([
        expect.objectContaining({ path: "components/Foo.ts", content: "LLM-owned content" }),
      ]);
      expect(restored).toEqual([]);
    });

    it.each([
      ["rewritable", "/components/Foo.ts"],
      ["verbatim", "/components/Foo.ts"],
      ["rewritable", "./components/Foo.ts"],
      ["rewritable", "components\\Foo.ts"],
    ] as const)("canonicalizes lone %s project-path spelling %s", (mode, path) => {
      const canonical = "canonical bytes";
      const llmContent = mode === "rewritable" ? "LLM-owned content" : canonical;
      mockGetDossierFileContent.mockReturnValue(canonical);
      const dossier = makeVerbatimDossier({
        codeFidelity: mode,
        files: [{ path: "components/Foo.ts", role: "shared", injectionMode: mode }],
      });
      const result = applyDossierVerbatimPolicy({
        llmFiles: [makeFile(path, llmContent)],
        selectedDossiers: [dossier],
      });
      expect(result.files).toEqual([
        expect.objectContaining({ path: "components/Foo.ts", content: llmContent }),
      ]);
    });

    it("rewrites verified imports to a canonicalized dossier target", () => {
      mockGetDossierFileContent.mockReturnValue("canonical seed");
      const dossier = makeVerbatimDossier({
        codeFidelity: "rewritable",
        files: [
          {
            path: "components/db-config-notice.tsx",
            role: "client",
            injectionMode: "rewritable",
          },
        ],
      });
      const result = applyDossierVerbatimPolicy({
        llmFiles: [
          makeFile("components/DB-config-notice.tsx", "LLM-owned notice"),
          makeFile(
            "app/page.tsx",
            'import { Notice } from "@/components/DB-config-notice";\nexport default Notice;',
          ),
        ],
        selectedDossiers: [dossier],
      });
      expect(result.files[0]).toEqual(
        expect.objectContaining({
          path: "components/db-config-notice.tsx",
          content: "LLM-owned notice",
        }),
      );
      expect(result.files[1]!.content).toContain('from "@/components/db-config-notice"');
    });

    it("leaves a lone path alias and its importer untouched when canonical bytes are unavailable", () => {
      mockGetDossierFileContent.mockReturnValue(null);
      const dossier = makeVerbatimDossier({
        files: [{ path: "components/Foo.ts", role: "shared" }],
      });
      const llmFiles = [
        makeFile("components/foo.ts", "LLM bytes"),
        makeFile("app/page.tsx", 'import { value } from "@/components/foo";'),
      ];
      const before = structuredClone(llmFiles);
      const result = applyDossierVerbatimPolicy({ llmFiles, selectedDossiers: [dossier] });
      expect(result).toEqual({ files: before, restored: [], changed: false });
      expect(llmFiles).toEqual(before);
    });

    it("canonicalizes an empty rewritable file path without replacing LLM content", () => {
      mockGetDossierFileContent.mockReturnValue("");
      const dossier = makeVerbatimDossier({
        codeFidelity: "rewritable",
        files: [{ path: "components/Foo.ts", role: "shared", injectionMode: "rewritable" }],
      });
      const result = applyDossierVerbatimPolicy({
        llmFiles: [makeFile("components/foo.ts", "LLM-owned content")],
        selectedDossiers: [dossier],
      });
      expect(result.files).toEqual([
        expect.objectContaining({ path: "components/Foo.ts", content: "LLM-owned content" }),
      ]);
      expect(result.restored).toEqual([]);
      expect(result.changed).toBe(true);
    });

    it("restores a readable empty verbatim file to zero bytes", () => {
      mockGetDossierFileContent.mockReturnValue("");
      const dossier = makeVerbatimDossier({
        files: [{ path: "components/Foo.ts", role: "shared", injectionMode: "verbatim" }],
      });
      const result = applyDossierVerbatimPolicy({
        llmFiles: [makeFile("components/Foo.ts", "drift")],
        selectedDossiers: [dossier],
      });
      expect(result.files[0]?.content).toBe("");
      expect(result.restored).toEqual([
        expect.objectContaining({ reason: "verbatim_content_drift" }),
      ]);
    });

    it("seeds a missing readable empty verbatim file", () => {
      mockGetDossierFileContent.mockReturnValue("");
      const dossier = makeVerbatimDossier({
        files: [{ path: "components/Foo.ts", role: "shared", injectionMode: "verbatim" }],
      });
      const result = applyDossierVerbatimPolicy({ llmFiles: [], selectedDossiers: [dossier] });
      expect(result.files).toEqual([
        expect.objectContaining({ path: "components/Foo.ts", content: "" }),
      ]);
      expect(result.restored).toEqual([
        expect.objectContaining({ reason: "verbatim_file_missing_in_llm_output" }),
      ]);
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
      expect(files.find((f) => f.path === "components/three-canvas-shell.tsx")?.content).toBe(
        canonical,
      );
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

  describe("rewritable_file_missing_seeded — SM-004: dossier-listed files must exist", () => {
    it("seeds a missing rewritable schema.ts that a verbatim sibling imports", () => {
      // postgres-drizzle shape: verbatim lib/db/index.ts does
      // `import * as schema from './schema'` where schema.ts is rewritable.
      // A restored index.ts without its schema is a broken import.
      const canonicalIndex = 'import * as schema from "./schema";\nexport const db = schema;';
      const canonicalSchema = "export const users = {};";
      mockGetDossierFileContent.mockImplementation((_klass, _id, relPath) =>
        relPath === "components/lib/db/index.ts"
          ? canonicalIndex
          : relPath === "components/lib/db/schema.ts"
            ? canonicalSchema
            : null,
      );

      const dossier = makeVerbatimDossier({
        id: "postgres-drizzle-like",
        capability: "database",
        files: [
          { path: "components/lib/db/index.ts", role: "server", injectionMode: "verbatim" },
          { path: "components/lib/db/schema.ts", role: "server", injectionMode: "rewritable" },
        ],
      });
      const { files, restored } = applyDossierVerbatimPolicy({
        // LLM emitted the verbatim helper untouched but omitted the schema.
        llmFiles: [makeFile("lib/db/index.ts", canonicalIndex)],
        selectedDossiers: [dossier],
        chatId: "chat-sm004",
      });

      expect(restored).toEqual([
        {
          path: "lib/db/schema.ts",
          dossierId: "postgres-drizzle-like",
          reason: "rewritable_file_missing_seeded",
        },
      ]);
      expect(files.find((f) => f.path === "lib/db/schema.ts")?.content).toBe(canonicalSchema);
    });

    it("does NOT seed when canonical content is unavailable (and does not warn loudly)", () => {
      mockGetDossierFileContent.mockReturnValue(null);
      const dossier = makeVerbatimDossier({
        codeFidelity: "rewritable",
        files: [{ path: "components/lib/db/schema.ts", role: "server" }],
      });
      const { restored } = applyDossierVerbatimPolicy({
        llmFiles: [],
        selectedDossiers: [dossier],
      });
      expect(restored).toHaveLength(0);
    });
  });

  describe("rewritable files present in the LLM output are never overwritten", () => {
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

  it("fails before mutation when selected dossiers claim a divergent output alias", () => {
    mockGetDossierFileContent.mockImplementation((_klass, id) =>
      id === "first" ? "first bytes" : "second bytes",
    );
    const first = makeVerbatimDossier({
      id: "first",
      capability: "one",
      files: [{ path: "components/Foo.ts", role: "shared" }],
    });
    const second = makeVerbatimDossier({
      id: "second",
      capability: "two",
      files: [{ path: "components/foo.ts", role: "shared" }],
    });
    const llmFiles = [makeFile("app/page.tsx", "unchanged")];
    expect(() =>
      applyDossierVerbatimPolicy({ llmFiles, selectedDossiers: [first, second] }),
    ).toThrow("selected-output-conflict");
    expect(llmFiles).toEqual([makeFile("app/page.tsx", "unchanged")]);
  });

  it("fails before mutation when LLM output contains duplicate aliases for a selected path", () => {
    mockGetDossierFileContent.mockReturnValue("canonical");
    const dossier = makeVerbatimDossier({
      files: [{ path: "components/Foo.ts", role: "shared" }],
    });
    const llmFiles = [
      makeFile("components/Foo.ts", "first"),
      makeFile("components/foo.ts", "second"),
    ];
    const before = structuredClone(llmFiles);
    expect(() => applyDossierVerbatimPolicy({ llmFiles, selectedDossiers: [dossier] })).toThrow(
      "llm-output-alias-conflict",
    );
    expect(llmFiles).toEqual(before);
  });

  it("treats leading-slash and canonical spellings as duplicate aliases before mutation", () => {
    mockGetDossierFileContent.mockReturnValue("canonical");
    const dossier = makeVerbatimDossier({
      files: [{ path: "components/Foo.ts", role: "shared" }],
    });
    const llmFiles = [
      makeFile("components/Foo.ts", "first"),
      makeFile("/components/Foo.ts", "second"),
    ];
    const before = structuredClone(llmFiles);
    expect(() => applyDossierVerbatimPolicy({ llmFiles, selectedDossiers: [dossier] })).toThrow(
      "llm-output-alias-conflict",
    );
    expect(llmFiles).toEqual(before);
  });

  it("fails before mutation when an LLM path is a file/directory conflict with a selected path", () => {
    mockGetDossierFileContent.mockReturnValue("canonical");
    const dossier = makeVerbatimDossier({
      files: [{ path: "components/cache", role: "shared" }],
    });
    const llmFiles = [
      makeFile("components/cache", "selected"),
      makeFile("components/cache/item.ts", "child"),
    ];
    const before = structuredClone(llmFiles);
    expect(() => applyDossierVerbatimPolicy({ llmFiles, selectedDossiers: [dossier] })).toThrow(
      "llm-output-path-conflict",
    );
    expect(llmFiles).toEqual(before);
  });
});

describe("request-local previous verbatim preservation", () => {
  it("captures readable empty verbatim bytes without seeding a missing rewritable file", () => {
    const dossier = makeVerbatimDossier({
      files: [
        { path: "components/middleware.ts", role: "server", injectionMode: "verbatim" },
        { path: "components/lib/clerk/config.ts", role: "shared", injectionMode: "rewritable" },
      ],
    });
    const snapshot = capturePreservedDossierVerbatimSnapshot({
      previousFiles: [makeFile("middleware.ts", "")],
      preservedDossiers: [dossier],
    });
    expect([...snapshot.byIdentity.values()]).toEqual([
      expect.objectContaining({ path: "middleware.ts", content: "" }),
    ]);
    expect(
      restorePreservedDossierVerbatimFiles({ files: [], snapshot }).files,
    ).toEqual([expect.objectContaining({ path: "middleware.ts", content: "" })]);
    expect([...snapshot.byIdentity.values()].some((file) => file.path.includes("config"))).toBe(
      false,
    );
  });

  it("fails closed for a portable alias instead of treating it as exact presence", () => {
    const dossier = makeVerbatimDossier({
      files: [{ path: "components/middleware.ts", role: "server", injectionMode: "verbatim" }],
    });
    expect(() =>
      capturePreservedDossierVerbatimSnapshot({
        previousFiles: [makeFile("Middleware.ts", "older bytes")],
        preservedDossiers: [dossier],
      }),
    ).toThrow("preserved-output-alias-conflict");
  });

  it("allows rewritable changes but detects later drift of captured verbatim bytes", () => {
    const dossier = makeVerbatimDossier({
      files: [
        { path: "components/middleware.ts", role: "server", injectionMode: "verbatim" },
        { path: "components/lib/clerk/config.ts", role: "shared", injectionMode: "rewritable" },
      ],
    });
    const snapshot = capturePreservedDossierVerbatimSnapshot({
      previousFiles: [
        makeFile("middleware.ts", "older bytes"),
        makeFile("lib/clerk/config.ts", "older config"),
      ],
      preservedDossiers: [dossier],
    });
    expect(() =>
      assertPreservedDossierVerbatimFiles({
        files: [
          makeFile("middleware.ts", "fixer drift"),
          makeFile("lib/clerk/config.ts", "new config"),
        ],
        snapshot,
      }),
    ).toThrow("preserved-verbatim-mutation");
  });

  it("rejects selected versus preserved file-directory claims before mutation", () => {
    mockGetDossierFileContent.mockReturnValue("canonical");
    const preserved = makeVerbatimDossier({
      id: "preserved",
      files: [{ path: "components/cache/item.ts", role: "shared", injectionMode: "verbatim" }],
    });
    const selected = makeVerbatimDossier({
      id: "selected",
      files: [{ path: "components/cache", role: "shared", injectionMode: "rewritable" }],
    });
    const snapshot = capturePreservedDossierVerbatimSnapshot({
      previousFiles: [makeFile("components/cache/item.ts", "older bytes")],
      preservedDossiers: [preserved],
    });
    expect(() =>
      assertCompatibleDossierOutputClaims({
        files: [],
        selectedDossiers: [selected],
        preservedVerbatim: snapshot,
      }),
    ).toThrow("active-output-conflict");
  });

  it("does not reserve an alias for a missing rewritable catalog file", () => {
    mockGetDossierFileContent.mockReturnValue("canonical");
    const dossier = makeVerbatimDossier({
      files: [{ path: "components/Foo.ts", role: "shared", injectionMode: "rewritable" }],
    });
    const snapshot = capturePreservedDossierVerbatimSnapshot({
      previousFiles: [],
      preservedDossiers: [dossier],
    });
    expect(snapshot.claims).toEqual([]);
    expect(() =>
      assertCompatibleDossierOutputClaims({
        files: [makeFile("components/foo.ts", "project bytes")],
        selectedDossiers: [],
        preservedVerbatim: snapshot,
      }),
    ).not.toThrow();
  });

  it("rejects selected canonical bytes that collide with divergent captured previous bytes", () => {
    mockGetDossierFileContent.mockReturnValue("new canonical bytes");
    const preserved = makeVerbatimDossier({
      id: "preserved",
      files: [{ path: "components/shared.ts", role: "shared", injectionMode: "verbatim" }],
    });
    const selected = makeVerbatimDossier({
      id: "selected",
      files: [{ path: "components/shared.ts", role: "shared", injectionMode: "verbatim" }],
    });
    const snapshot = capturePreservedDossierVerbatimSnapshot({
      previousFiles: [makeFile("components/shared.ts", "older actual bytes")],
      preservedDossiers: [preserved],
    });
    expect(() =>
      assertCompatibleDossierOutputClaims({
        files: [makeFile("components/shared.ts", "older actual bytes")],
        selectedDossiers: [selected],
        preservedVerbatim: snapshot,
      }),
    ).toThrow("active-output-conflict");
  });
});
