/**
 * Consolidated sections:
 * - scaffold-variant.ts
 * - scaffold-and-toolkit.ts
 *
 * Grouped during OMTAG-03 style refactor — no behavior change.
 */

import type { PaletteState } from "@/lib/builder/palette";
import type { ScaffoldVariant } from "../../scaffold-variants";
import { resolveGoogleFontImportName } from "../../data/google-font-registry";
import { formatThemeTokenLines } from "../theme-token";
import type { ScaffoldManifest, ScaffoldId } from "../../scaffolds/types";
import { buildRegistryDrivenShadcnToolkitSummary } from "../../data/shadcn-toolkit-summary";

export function renderScaffoldVariantBlock(
  effectiveVariant: ScaffoldVariant | null | undefined,
): string[] {
  if (!effectiveVariant) return [];
  const parts: string[] = [
    "## Scaffold Variant (this generation)",
    "",
    "> **These are visual reference points, not a contract.** Adapt spacing, ordering, tone, and micro-details freely when it improves the result or better fits the user's brief. Keep the scaffold's route structure and component vocabulary intact — those remain load-bearing.",
    "",
    `- **Variant:** ${effectiveVariant.label} (\`${effectiveVariant.id}\`)`,
    `- **Scaffold:** \`${effectiveVariant.scaffoldId}\``,
    `- **Color mode:** ${effectiveVariant.colorMode}`,
    `- **Signature motif:** ${effectiveVariant.signatureMotif}`,
  ];
  if (effectiveVariant.description) {
    parts.push(`- **Variant purpose:** ${effectiveVariant.description}`);
  }
  if (effectiveVariant.fontPairings.length > 0) {
    const pairStr = effectiveVariant.fontPairings
      .map((p) => `${p.heading} + ${p.body}`)
      .join(", or ");
    parts.push(`- **Suggested font pairings:** ${pairStr} (via next/font/google)`);
    const importHints: string[] = [];
    const seenImportNames = new Set<string>();
    for (const pair of effectiveVariant.fontPairings) {
      for (const name of [pair.heading, pair.body]) {
        const importName = resolveGoogleFontImportName(name);
        if (importName && importName !== name && !seenImportNames.has(importName)) {
          seenImportNames.add(importName);
          importHints.push(`\`${name}\` → \`import { ${importName} } from "next/font/google"\``);
        }
      }
    }
    if (importHints.length > 0) {
      parts.push(`  - Import names: ${importHints.join("; ")}`);
    }
  }
  if (effectiveVariant.promptHints.length > 0) {
    parts.push("- **Variant cues:**");
    for (const hint of effectiveVariant.promptHints.slice(0, 3)) {
      parts.push(`  - ${hint}`);
    }
  }
  const sig = effectiveVariant.signaturePatterns;
  if (sig && (sig.layouts.length || sig.motifs.length || sig.antiPatterns.length)) {
    // Concrete layout/motif/anti-pattern signatures, replacing the generic
    // guidance fields removed 2026-04-17. Populated by
    // scripts/scaffolds/auto-curate-variant-patterns.ts (GPT-5.4 + Zod).
    if (sig.layouts.length > 0) {
      parts.push("- **Signature layouts:**");
      for (const layout of sig.layouts.slice(0, 5)) {
        parts.push(`  - ${layout}`);
      }
    }
    if (sig.motifs.length > 0) {
      parts.push("- **Signature motifs:**");
      for (const motif of sig.motifs.slice(0, 4)) {
        parts.push(`  - ${motif}`);
      }
    }
    if (sig.antiPatterns.length > 0) {
      parts.push(
        "- **Patterns that typically don't fit this variant** (avoid unless the prompt specifically asks for them):",
      );
      for (const anti of sig.antiPatterns.slice(0, 4)) {
        parts.push(`  - ${anti}`);
      }
    }
  }
  const themeTokenLines = formatThemeTokenLines(effectiveVariant);
  if (themeTokenLines.length > 0) {
    parts.push(
      "- **Theme tokens (variant defaults — override only when the brief or locked theme says otherwise):**",
    );
    parts.push(...themeTokenLines);
  }
  if ((effectiveVariant.sourceTemplateIds?.length ?? 0) > 0) {
    parts.push(
      `- **Derived from curated references:** ${effectiveVariant.sourceTemplateIds!.slice(0, 4).join(", ")}`,
    );
  }
  parts.push("");
  return parts;
}

export function renderDesignPriorityBlock(): string[] {
  return [
    "## Design Priority",
    "",
    "When multiple sources suggest different colors, fonts, or visual direction, follow this order:",
    "1. User-locked theme tokens (if set in builder UI) — absolute, never override",
    "2. Brief visual direction (colorPalette, typography, tone, domainProfile) — primary design intent",
    "3. Scaffold Variant defaults (theme tokens, font pairings, signature motif, prompt hints) — fallback when brief is silent",
    "4. Static core defaults — fallback values from Core Rules when neither brief nor variant provides guidance",
    "",
  ];
}

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
