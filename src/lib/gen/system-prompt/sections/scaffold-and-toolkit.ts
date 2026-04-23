/**
 * Scaffold context + Scaffold Research Priorities + Your Toolkit.
 *
 * Split out of `system-prompt.ts` (OMTAG-03 wave-rest) — no behavior change.
 */

import type { PaletteState } from "@/lib/builder/palette";
import type { ScaffoldManifest, ScaffoldId } from "../../scaffolds/types";
import { buildRegistryDrivenShadcnToolkitSummary } from "../../data/shadcn-toolkit-summary";

export function renderScaffoldContextBlock(scaffoldContext?: string): string[] {
  // scaffoldContext already starts with its own ## heading from serialize.ts
  // (e.g. "## Scaffold: landing-page (inspirational mode)"). Adding an extra
  // "## Scaffold" wrapper would create a near-empty required block while the
  // real content ends up in a separate block with wrong priority.
  if (!scaffoldContext) return [];
  return [scaffoldContext.trim(), ""];
}

export function renderScaffoldResearchBlock(
  resolvedScaffold: ScaffoldManifest | null | undefined,
): string[] {
  if (!resolvedScaffold) return [];
  const checklist = resolvedScaffold.qualityChecklist?.slice(0, 6) ?? [];
  const upgradeTargets = resolvedScaffold.research?.upgradeTargets?.slice(0, 3) ?? [];
  const referenceTemplates = resolvedScaffold.research?.referenceTemplates ?? [];
  // Fas C: Brief now carries variant-derived design direction (Fas A/B),
  // so reference inspirations are trimmed to 2 compact lines (no strengths).
  const referenceLines = referenceTemplates.slice(0, 2).map(
    (t) => `  - ${t.title} (${t.categorySlug}, score ${t.qualityScore})`,
  );

  if (checklist.length === 0 && upgradeTargets.length === 0 && referenceLines.length === 0) {
    return [];
  }

  const parts: string[] = [
    "## Scaffold Research Priorities",
    "",
    `Use these runtime priorities for the selected scaffold (${resolvedScaffold.label}) while adapting the implementation to the user's request.`,
  ];
  if (checklist.length > 0) {
    parts.push("", "- Quality checklist:");
    parts.push(...checklist.map((item) => `  - ${item}`));
  }
  if (upgradeTargets.length > 0) {
    parts.push("", "- Upgrade targets:");
    parts.push(...upgradeTargets.map((item) => `  - ${item}`));
  }
  if (referenceLines.length > 0) {
    parts.push("", "- Reference inspirations:");
    parts.push(...referenceLines);
  }
  parts.push("");
  return parts;
}

function extractCapabilityHintLines(capabilityHints?: string): string[] {
  if (!capabilityHints?.trim()) return [];
  return capabilityHints
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "));
}

function buildShadcnToolkitSummary(ctx?: {
  scaffoldId?: ScaffoldId | null;
}): string[] {
  return buildRegistryDrivenShadcnToolkitSummary(
    ctx?.scaffoldId ? ctx : undefined,
  );
}

export function renderToolkitBlock(params: {
  resolvedScaffold: ScaffoldManifest | null | undefined;
  capabilityHints: string | undefined;
  componentPalette: PaletteState | null | undefined;
}): string[] {
  const { resolvedScaffold, capabilityHints, componentPalette } = params;
  const capabilityLines = extractCapabilityHintLines(capabilityHints);
  const paletteSelections = componentPalette?.selections ?? [];
  const paletteLines = paletteSelections.slice(0, 12).map((selection) => {
    const tags = selection.tags?.length ? ` (${selection.tags.slice(0, 3).join(", ")})` : "";
    return `  - ${selection.label} [${selection.source}]${tags}`;
  });
  const toolkitLines: string[] = [
    "## Your Toolkit",
    "",
    "Use these confirmed, safe building blocks. Prefer them over inventing parallel UI primitives or adding unvetted libraries.",
    "",
    "- shadcn/ui (registry-synced local layer; import from `@/components/ui/<subpath>`):",
    ...buildShadcnToolkitSummary({
      scaffoldId: resolvedScaffold?.id ?? null,
    }),
  ];
  if (capabilityLines.length > 0) {
    toolkitLines.push("", "- Capability-driven additions for this request:");
    toolkitLines.push(...capabilityLines.map((line) => `  - ${line.slice(2)}`));
  }
  if (paletteLines.length > 0) {
    toolkitLines.push("", "- Curated component palette from builder context:");
    toolkitLines.push(...paletteLines);
  }
  toolkitLines.push("");
  return toolkitLines;
}
