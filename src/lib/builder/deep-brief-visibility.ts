/**
 * Deep Brief visibility helpers: reasoning summary from generateObject,
 * plus a compact "ritning" fallback when reasoning is missing (cache hits,
 * Anthropic, empty provider output).
 *
 * `reasoningSummary` is a UI/transport field, not part of siteBriefSchema.
 */

export const BRIEF_REASONING_SUMMARY_KEY = "reasoningSummary";

/** AI SDK `providerOptions.openai.reasoningSummary` — maps 1:1 to Responses `reasoning.summary`. */
export const OPENAI_REASONING_SUMMARY_DETAILED = "detailed" as const;

const OPENAI_REASONING_MODEL_RE = /(^|\/)(o[1-9]|gpt-5)/;

export function supportsOpenAIReasoningSummary(modelId: string): boolean {
  return OPENAI_REASONING_MODEL_RE.test(modelId.trim().toLowerCase());
}

export function openaiBriefReasoningProviderOptions(): {
  openai: { reasoningSummary: "detailed" };
} {
  return { openai: { reasoningSummary: OPENAI_REASONING_SUMMARY_DETAILED } };
}

export function mergeOpenAIBriefProviderOptions(extra?: {
  openai?: Record<string, unknown>;
}): { openai: Record<string, unknown> } {
  return {
    openai: {
      reasoningSummary: OPENAI_REASONING_SUMMARY_DETAILED,
      ...extra?.openai,
    },
  };
}

export function extractGenerateObjectReasoning(result: {
  reasoning?: unknown;
}): string | null {
  if (typeof result.reasoning !== "string") return null;
  const trimmed = result.reasoning.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readBriefReasoningSummary(
  brief: Record<string, unknown> | null | undefined,
): string | null {
  if (!brief) return null;
  const value = brief[BRIEF_REASONING_SUMMARY_KEY];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function attachBriefReasoningSummary(
  brief: Record<string, unknown>,
  reasoning: string | null,
): Record<string, unknown> {
  if (!reasoning) return brief;
  return { ...brief, [BRIEF_REASONING_SUMMARY_KEY]: reasoning };
}

export function omitBriefReasoningSummary(
  brief: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!brief) return null;
  if (!(BRIEF_REASONING_SUMMARY_KEY in brief)) return brief;
  const { [BRIEF_REASONING_SUMMARY_KEY]: _removed, ...rest } = brief;
  return rest;
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatPagesLine(pages: unknown): string | null {
  if (!Array.isArray(pages) || pages.length === 0) return null;
  const parts = pages.slice(0, 8).map((page) => {
    if (!page || typeof page !== "object") return null;
    const rec = page as Record<string, unknown>;
    const name = asTrimmedString(rec.name) ?? "Sida";
    const path = asTrimmedString(rec.path);
    const sections = Array.isArray(rec.sections)
      ? rec.sections
          .slice(0, 6)
          .map((section) => {
            if (!section || typeof section !== "object") return null;
            const sec = section as Record<string, unknown>;
            return asTrimmedString(sec.heading) ?? asTrimmedString(sec.type);
          })
          .filter((label): label is string => Boolean(label))
      : [];
    const title = path ? `${name} (${path})` : name;
    return sections.length > 0 ? `${title} — ${sections.join(", ")}` : title;
  });
  const compact = parts.filter((part): part is string => Boolean(part));
  return compact.length > 0 ? `Sidor: ${compact.join("; ")}` : null;
}

function formatPaletteLine(brief: Record<string, unknown>): string | null {
  const vis =
    brief.visualDirection && typeof brief.visualDirection === "object"
      ? (brief.visualDirection as Record<string, unknown>)
      : null;
  const palette =
    vis?.colorPalette && typeof vis.colorPalette === "object"
      ? (vis.colorPalette as Record<string, unknown>)
      : null;
  if (!palette) return null;
  const swatches = ["primary", "secondary", "accent", "background", "text"]
    .map((key) => asTrimmedString(palette[key]))
    .filter((value): value is string => Boolean(value));
  return swatches.length > 0 ? `Palett: ${swatches.join(" · ")}` : null;
}

function formatTypographyLine(brief: Record<string, unknown>): string | null {
  const vis =
    brief.visualDirection && typeof brief.visualDirection === "object"
      ? (brief.visualDirection as Record<string, unknown>)
      : null;
  const typography =
    vis?.typography && typeof vis.typography === "object"
      ? (vis.typography as Record<string, unknown>)
      : null;
  if (!typography) return null;
  const headings = asTrimmedString(typography.headings);
  const body = asTrimmedString(typography.body);
  if (!headings && !body) return null;
  if (headings && body) return `Typografi: rubriker ${headings}, brödtext ${body}`;
  if (headings) return `Typografi: rubriker ${headings}`;
  return `Typografi: brödtext ${body}`;
}

export function formatDeepBriefBlueprint(
  brief: Record<string, unknown> | null | undefined,
): string | null {
  if (!brief) return null;
  const lines: string[] = [];
  const pitch = asTrimmedString(brief.oneSentencePitch);
  if (pitch) lines.push(`Pitch: ${pitch}`);
  const pages = formatPagesLine(brief.pages);
  if (pages) lines.push(pages);
  const palette = formatPaletteLine(brief);
  if (palette) lines.push(palette);
  const typography = formatTypographyLine(brief);
  if (typography) lines.push(typography);
  return lines.length > 0 ? lines.join("\n") : null;
}

export type DeepBriefVisibility = {
  reasoning: string | null;
  blueprint: string | null;
};

/**
 * Prefer model reasoning. When it is missing (Redis cache v1, Anthropic,
 * empty generateObject.reasoning) fall back to the brief's key content.
 */
export function buildDeepBriefVisibility(
  brief: Record<string, unknown> | null | undefined,
): DeepBriefVisibility {
  const reasoning = readBriefReasoningSummary(brief);
  if (reasoning) {
    return { reasoning, blueprint: null };
  }
  return { reasoning: null, blueprint: formatDeepBriefBlueprint(brief) };
}

export function readDeepBriefVisibilityFromMeta(meta: Record<string, unknown>): DeepBriefVisibility {
  const reasoning =
    typeof meta.deepBriefReasoning === "string" && meta.deepBriefReasoning.trim()
      ? meta.deepBriefReasoning.trim()
      : null;
  const blueprint =
    typeof meta.deepBriefBlueprint === "string" && meta.deepBriefBlueprint.trim()
      ? meta.deepBriefBlueprint.trim()
      : null;
  if (reasoning) return { reasoning, blueprint: null };
  return { reasoning: null, blueprint };
}
