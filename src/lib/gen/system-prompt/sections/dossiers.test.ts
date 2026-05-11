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
