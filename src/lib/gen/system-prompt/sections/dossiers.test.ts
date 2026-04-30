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
});
