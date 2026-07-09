import { describe, expect, it } from "vitest";
import type { DossierSelectionResult } from "../../dossiers";
import { renderCapabilityModifyHintBlock, renderDossierBlocks } from "./dossiers";

// Plan 11 / open-question #12: when the follow-up was classified as
// `capability-modify`, `renderCapabilityModifyHintBlock` is the dossier
// section's substitute for the suppressed "Available Dossiers" pool. It
// must instruct the LLM to mutate the existing scene file rather than
// emit a fresh shell — without this hint the model would render an
// empty section in place of the original feature.
describe("renderCapabilityModifyHintBlock — plan 11 bug 3", () => {
  it("returns nothing when no hint is supplied", () => {
    expect(renderCapabilityModifyHintBlock(null)).toEqual([]);
    expect(renderCapabilityModifyHintBlock(undefined)).toEqual([]);
  });

  it("returns nothing when capabilityIds is empty (defensive)", () => {
    expect(
      renderCapabilityModifyHintBlock({ capabilityIds: [], references: ["pricken"] }),
    ).toEqual([]);
  });

  it("emits the modify-this directive with capability ids and reference tokens", () => {
    const block = renderCapabilityModifyHintBlock({
      capabilityIds: ["visual-3d"],
      references: ["pricken", "den"],
    });
    const text = block.join("\n");
    expect(text).toContain("Modify Existing Capability");
    expect(text).toContain("Do NOT Re-Inject Dossier Shell");
    expect(text).toContain("`visual-3d`");
    expect(text).toContain("`pricken`");
    expect(text).toContain("Modify that existing file in place");
  });

  it("renders gracefully when references is empty (the user used a bare deictic)", () => {
    const block = renderCapabilityModifyHintBlock({
      capabilityIds: ["visual-3d"],
      references: [],
    });
    const text = block.join("\n");
    expect(text).toContain("`visual-3d`");
    expect(text).toContain("no explicit token captured");
  });
});

describe("renderDossierBlocks — compact dossier instructions", () => {
  const threeFiberSelection: DossierSelectionResult = {
    poolSize: 1,
    byCapability: { "visual-3d": ["three-fiber-canvas"] },
    selected: [
      {
        reason: "capability-match",
        configured: true,
        entry: {
          class: "soft",
          id: "three-fiber-canvas",
          label: "Three Fiber 3D Canvas",
          capability: "visual-3d",
          codeFidelity: "rewritable",
          complexity: "medium",
          defaultForCapability: true,
          summary: "SSR-safe React Three Fiber canvas wrapper for decorative 3D scenes.",
          envVars: [],
          dependencies: ["three", "@react-three/fiber", "@react-three/drei"],
          files: [],
          exposes: [
            {
              name: "ThreeCanvasShell",
              type: "component",
              import: "@/components/three-canvas-shell",
            },
          ],
          lastVerified: "2026-04-30",
          instructions:
            "Very long full instructions with @react-three/rapier, <Physics> and <RigidBody> examples that should not leak into decorative follow-up mode.",
        },
      },
    ],
  };

  it("uses compact instructions for decorative visual-3d follow-ups", () => {
    const text = renderDossierBlocks(threeFiberSelection, {
      generationMode: "followUp",
      requestedCapabilityTiers: { "visual-3d": "generic" },
    }).join("\n");
    expect(text).toContain("compact instructions");
    expect(text).toContain("ThreeCanvasShell");
    expect(text).not.toContain("Very long full instructions");
    expect(text).not.toContain("@react-three/rapier");
    expect(text).not.toContain("<Physics>");
    expect(text).not.toContain("<RigidBody>");
  });

  it("uses compact instructions by default for init", () => {
    const text = renderDossierBlocks(threeFiberSelection, {
      generationMode: "init",
      requestedCapabilityTiers: null,
    }).join("\n");
    expect(text).toContain("compact instructions");
    expect(text).toContain("Dependencies if used: three, @react-three/fiber, @react-three/drei.");
    expect(text).not.toContain("Very long full instructions");
  });

  it("keeps full instructions for beyond-dossier 3D follow-ups", () => {
    const text = renderDossierBlocks(threeFiberSelection, {
      generationMode: "followUp",
      requestedCapabilityTiers: { "visual-3d": "beyond-dossier" },
    }).join("\n");
    expect(text).toContain("Very long full instructions");
  });

  it("keeps full instructions when follow-up tier metadata is missing", () => {
    const text = renderDossierBlocks(threeFiberSelection, {
      generationMode: "followUp",
      requestedCapabilityTiers: null,
    }).join("\n");
    expect(text).toContain("compact instructions");
    expect(text).not.toContain("Very long full instructions");
  });

  it("emits three-fiber-canvas verbatim at components/three-canvas-shell.tsx", () => {
    // Regression guard for the 2026-05-01 rotorsaken: verbatim dossier
    // paths MUST go through `mapDossierPathToOutput`. Before the fix the
    // block stripped `components/` and produced a root-level file — the
    // `@/components/three-canvas-shell` import in app/page.tsx then
    // pointed at the scaffold baseline instead of the dossier shell, and
    // the LLM tried to bridge by emitting a second half-stub file.
    const realSelection: DossierSelectionResult = {
      poolSize: 1,
      byCapability: { "visual-3d": ["three-fiber-canvas"] },
      selected: [
        {
          reason: "capability-match",
          configured: true,
          entry: {
            class: "soft",
            id: "three-fiber-canvas",
            label: "Three Fiber 3D Canvas",
            capability: "visual-3d",
            codeFidelity: "rewritable",
            complexity: "medium",
            defaultForCapability: true,
            summary: "SSR-safe React Three Fiber canvas wrapper.",
            envVars: [],
            dependencies: ["three", "@react-three/fiber"],
            files: [
              {
                path: "components/three-canvas-shell.tsx",
                role: "client",
                injectionMode: "verbatim",
              },
            ],
            exposes: [
              {
                name: "ThreeCanvasShell",
                type: "component",
                import: "@/components/three-canvas-shell",
              },
            ],
            lastVerified: "2026-04-30",
          },
        },
      ],
    };
    const text = renderDossierBlocks(realSelection).join("\n");
    expect(text).toContain("## Dossier Files To Emit Verbatim");
    expect(text).toContain('```tsx file="components/three-canvas-shell.tsx"');
    // The emitted path must live under `components/` (so `@/components/...`
    // imports resolve). The old bug stripped the prefix and put the shell
    // at the project root, producing a duplicate and a broken import.
    expect(text).not.toContain('```tsx file="three-canvas-shell.tsx"\n');
    expect(text).toContain("→ `components/three-canvas-shell.tsx`");
  });

  it("skips verbatim blocks for files already in the previous project", () => {
    // Auto-repair / follow-up regression: the `three-canvas-shell.tsx` file
    // exists in the previous version and is listed in `## Current Project
    // Files`. Re-shipping the full CodeProject block wastes ~5k chars and
    // tempts the LLM to emit it unchanged when the real fix is elsewhere.
    // The new `previousFilePaths` signal lets us collapse it to a pointer.
    const realSelection: DossierSelectionResult = {
      poolSize: 1,
      byCapability: { "visual-3d": ["three-fiber-canvas"] },
      selected: [
        {
          reason: "capability-match",
          configured: true,
          entry: {
            class: "soft",
            id: "three-fiber-canvas",
            label: "Three Fiber 3D Canvas",
            capability: "visual-3d",
            codeFidelity: "rewritable",
            complexity: "medium",
            defaultForCapability: true,
            summary: "SSR-safe canvas wrapper.",
            envVars: [],
            dependencies: [],
            files: [
              {
                path: "components/three-canvas-shell.tsx",
                role: "client",
                injectionMode: "verbatim",
              },
            ],
            exposes: [
              {
                name: "ThreeCanvasShell",
                type: "component",
                import: "@/components/three-canvas-shell",
              },
            ],
            lastVerified: "2026-04-30",
          },
        },
      ],
    };
    const text = renderDossierBlocks(realSelection, {
      generationMode: "followUp",
      previousFilePaths: ["components/three-canvas-shell.tsx", "app/page.tsx"],
    }).join("\n");
    expect(text).toContain("## Dossier Verbatim Files Already in Project");
    expect(text).toContain("`components/three-canvas-shell.tsx`");
    // Critical: no full CodeProject block for an already-present file.
    expect(text).not.toContain('```tsx file="components/three-canvas-shell.tsx"');
    expect(text).not.toContain("## Dossier Files To Emit Verbatim");
  });

  it("still emits full verbatim blocks on init even with previousFilePaths set", () => {
    const realSelection: DossierSelectionResult = {
      poolSize: 1,
      byCapability: { "visual-3d": ["three-fiber-canvas"] },
      selected: [
        {
          reason: "capability-match",
          configured: true,
          entry: {
            class: "soft",
            id: "three-fiber-canvas",
            label: "Three Fiber 3D Canvas",
            capability: "visual-3d",
            codeFidelity: "rewritable",
            complexity: "medium",
            defaultForCapability: true,
            summary: "SSR-safe canvas wrapper.",
            envVars: [],
            dependencies: [],
            files: [
              {
                path: "components/three-canvas-shell.tsx",
                role: "client",
                injectionMode: "verbatim",
              },
            ],
            exposes: [],
            lastVerified: "2026-04-30",
          },
        },
      ],
    };
    const text = renderDossierBlocks(realSelection, {
      generationMode: "init",
      previousFilePaths: ["components/three-canvas-shell.tsx"],
    }).join("\n");
    expect(text).toContain("## Dossier Files To Emit Verbatim");
    expect(text).toContain('```tsx file="components/three-canvas-shell.tsx"');
    expect(text).not.toContain("## Dossier Verbatim Files Already in Project");
  });

  // promptInstructionMode: "selected-sections" — surface the do/don't rules
  // from instructions.md (When to use / How to integrate / Avoid) without the
  // whole file or the manifest-only compact fallback.
  function selectedSectionsSelection(
    instructions: string | undefined,
  ): DossierSelectionResult {
    return {
      poolSize: 1,
      byCapability: { "logo-cloud": ["logo-cloud"] },
      selected: [
        {
          reason: "capability-match",
          configured: true,
          entry: {
            class: "soft",
            id: "logo-cloud",
            label: "Logo Cloud",
            capability: "logo-cloud",
            codeFidelity: "rewritable",
            complexity: "simple",
            defaultForCapability: true,
            summary: "Trusted-by logo strip of customer/partner logos.",
            envVars: [],
            dependencies: [],
            files: [],
            exposes: [],
            lastVerified: "2026-06-25",
            promptInstructionMode: "selected-sections",
            instructions,
          },
        },
      ],
    };
  }

  const FULL_LOGO_INSTRUCTIONS = [
    "# When to use",
    "",
    "Use for a trusted-by logo strip.",
    "",
    "# How to integrate",
    "",
    "Import LogoCloud and pass an items array.",
    "",
    "# UX rules",
    "",
    "Aim for 4-8 logos at a uniform height.",
    "",
    "# Avoid",
    "",
    "Do not fabricate brand logos you have no rights to use.",
    "",
    "# Verification",
    "",
    "Render with 6 items and tab to a logo.",
    "",
  ].join("\n");

  it("renders the key instruction sections for selected-sections mode", () => {
    const text = renderDossierBlocks(selectedSectionsSelection(FULL_LOGO_INSTRUCTIONS), {
      generationMode: "init",
    }).join("\n");
    expect(text).toContain("Logo Cloud (`logo-cloud`) — key instructions");
    expect(text).toContain("When to use");
    expect(text).toContain("How to integrate");
    expect(text).toContain("Avoid");
    expect(text).toContain("Do not fabricate brand logos you have no rights to use.");
    // Only the three selected headings render — UX rules / Verification bodies do not.
    expect(text).not.toContain("compact instructions");
    expect(text).not.toContain("Aim for 4-8 logos at a uniform height.");
    expect(text).not.toContain("Render with 6 items and tab to a logo.");
  });

  it("falls back to compact when selected-sections has no extractable headings", () => {
    const text = renderDossierBlocks(
      selectedSectionsSelection("Just a paragraph with no markdown headings."),
      { generationMode: "init" },
    ).join("\n");
    expect(text).toContain("compact instructions");
    expect(text).not.toContain("key instructions");
  });

  it("uses compact instructions when promptInstructionMode is unset (default)", () => {
    const text = renderDossierBlocks(threeFiberSelection, { generationMode: "init" }).join("\n");
    expect(text).toContain("compact instructions");
    expect(text).not.toContain("key instructions");
  });

  it("never truncates inside a code fence and still reaches Avoid (Codex #254 P2)", () => {
    const fenceHeavy = [
      "# When to use",
      "",
      // Long enough that, under a shared running budget, it would have starved
      // the later sections and forced a mid-fence truncation of How to integrate.
      "X".repeat(700),
      "",
      "# How to integrate",
      "",
      "Import the component:",
      "",
      "```tsx",
      'import { LogoCloud } from "@/components/logo-cloud";',
      "export default function S() {",
      '  return <LogoCloud items={[{ name: "Acme" }]} />;',
      "}",
      "```",
      "",
      "# Avoid",
      "",
      "Do not fabricate brand logos you have no rights to use.",
      "",
    ].join("\n");
    const text = renderDossierBlocks(selectedSectionsSelection(fenceHeavy), {
      generationMode: "init",
    }).join("\n");
    // 1. Balanced fences — the code fence is stripped, so none can be left open.
    expect((text.match(/```/g) ?? []).length % 2).toBe(0);
    expect(text).not.toContain("import { LogoCloud }");
    expect(text).toContain("code example omitted");
    // 2. The Avoid rules survive (not starved by the long earlier sections).
    expect(text).toContain("Do not fabricate brand logos you have no rights to use.");
    // 3. The per-section cap still applies to the long When-to-use body.
    expect(text).toContain("…");
  });

  // Våg 2: the manifest `mock` field is threaded into the compact dossier
  // instructions as a one-line demo-mode hint (hard dossiers only).
  function hardMockSelection(mock: "canned" | "seed" | "success" | "none" | undefined): DossierSelectionResult {
    return {
      poolSize: 1,
      byCapability: { "ai-chat": ["openai-chat"] },
      selected: [
        {
          reason: "capability-match",
          configured: false,
          entry: {
            class: "hard",
            id: "openai-chat",
            label: "OpenAI Chat",
            capability: "ai-chat",
            codeFidelity: "rewritable",
            complexity: "medium",
            defaultForCapability: true,
            summary: "Streaming chat assistant powered by OpenAI via the Vercel AI SDK.",
            envVars: [
              {
                key: "OPENAI_API_KEY",
                required: true,
                enforcement: "feature-runtime",
                purpose: "Server-side OpenAI API authentication.",
              },
            ],
            dependencies: ["ai", "@ai-sdk/openai"],
            files: [],
            exposes: [],
            lastVerified: "2026-04-20",
            mock,
            // Presence of instructions triggers the compact-instructions block
            // where the mock-mode hint line is rendered.
            instructions: "When to use: a chat assistant. How to integrate: mount <ChatPanel/>.",
          },
        },
      ],
    };
  }

  it("emits the mock-mode hint line for a hard dossier (mock: canned)", () => {
    const text = renderDossierBlocks(hardMockSelection("canned"), { generationMode: "init" }).join("\n");
    expect(text).toContain("mock: canned");
    expect(text).toContain("without a real key");
  });

  it("emits the mock: success hint for a success-mode hard dossier", () => {
    const text = renderDossierBlocks(hardMockSelection("success"), { generationMode: "init" }).join("\n");
    expect(text).toContain("mock: success");
  });

  it("falls back to mock: none when the manifest omits mock", () => {
    const text = renderDossierBlocks(hardMockSelection(undefined), { generationMode: "init" }).join("\n");
    expect(text).toContain("mock: none");
  });

  it("does NOT emit a mock line for soft dossiers", () => {
    const text = renderDossierBlocks(threeFiberSelection, { generationMode: "init" }).join("\n");
    expect(text).not.toContain("mock: ");
  });

  it("fails fast when a selected verbatim dossier file is missing on disk", () => {
    const selection: DossierSelectionResult = {
      poolSize: 1,
      byCapability: { payments: ["missing-hard-dossier"] },
      selected: [
        {
          reason: "capability-match",
          configured: true,
          entry: {
            class: "hard",
            id: "missing-hard-dossier",
            label: "Missing hard dossier",
            capability: "payments",
            codeFidelity: "verbatim",
            complexity: "medium",
            defaultForCapability: true,
            summary: "Test dossier with a missing verbatim file.",
            envVars: [],
            dependencies: [],
            files: [
              {
                path: "components/api/missing/route.ts",
                role: "server",
                injectionMode: "verbatim",
              },
            ],
            exposes: [],
            lastVerified: "2026-04-30",
            instructions: "Emit missing file.",
          },
        },
      ],
    };

    expect(() => renderDossierBlocks(selection)).toThrow(
      "verbatim-missing missing-hard-dossier",
    );
  });
});
