/**
 * Optional LLM pass: rewrite the site's title and description.
 *
 * Scope is deliberately narrow. Title and description are two string literals
 * in one metadata object — the model cannot break the build by getting them
 * wrong, and they are the two fields that decide whether a search result gets
 * clicked. Alt text and heading structure are NOT touched here: fixing those
 * means rewriting JSX, which turns a copy improvement into a build risk.
 *
 * Everything degrades to "no change": no API key, a provider error, a refusal,
 * or a reply that fails the schema all leave the deterministic result standing
 * and set `skippedReason` so the report can say why instead of silently
 * looking thinner than it should.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { getOpenAIModel } from "@/lib/gen/models";
import { recordLlmUsage } from "@/lib/observability/llm-usage";
import type { ProjectTextFile } from "@/lib/gen/scaffolds/seo-defaults";
import type { SeoBrand } from "@/lib/projects/preferences-schema";
import type { SeoAuditResult, SeoImprovement } from "./types";

const SeoCopySchema = z.object({
  title: z.string(),
  description: z.string(),
});

const COPY_FINDING_IDS = new Set([
  "missing-title",
  "title-too-short",
  "title-too-long",
  "missing-description",
  "description-too-short",
  "description-too-long",
]);

const LAYOUT_PATHS = new Set(["app/layout.tsx", "src/app/layout.tsx"]);
const TIMEOUT_MS = 20_000;
/** Enough of the site to describe it; far short of the whole project. */
const MAX_CONTEXT_CHARS = 6_000;

export interface SeoCopyResult {
  files: ProjectTextFile[];
  improvements: SeoImprovement[];
  skippedReason: string | null;
}

/**
 * Replace a `key: "..."` string literal inside the metadata export.
 *
 * Escapes the replacement so an apostrophe in Swedish copy ("Sveriges bästa
 * däck — vi fixar's") cannot terminate the literal and break the build. Only
 * the FIRST occurrence is replaced: the metadata export is at the top of the
 * layout, and a later `title:` inside page content is not ours to rewrite.
 */
export function replaceMetadataString(
  source: string,
  key: string,
  value: string,
): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const re = new RegExp(`(\\b${key}\\s*:\\s*)(["'\`])([^"'\`]*)\\2`);
  if (!re.test(source)) return source;
  return source.replace(re, `$1"${escaped}"`);
}

function buildSiteContext(files: ReadonlyArray<ProjectTextFile>): string {
  const parts: string[] = [];
  let budget = MAX_CONTEXT_CHARS;
  // Pages first — they carry the words a human would use to describe the site.
  const ordered = [...files].sort((a, b) => {
    const aPage = /page\.tsx$/.test(a.name) ? 0 : 1;
    const bPage = /page\.tsx$/.test(b.name) ? 0 : 1;
    return aPage - bPage;
  });
  for (const file of ordered) {
    if (budget <= 0) break;
    if (!/\.(t|j)sx$/.test(file.name)) continue;
    const slice = file.content.slice(0, Math.min(1_200, budget));
    parts.push(`--- ${file.name} ---\n${slice}`);
    budget -= slice.length;
  }
  return parts.join("\n\n");
}

export async function improveSeoCopyWithLlm(
  files: ReadonlyArray<ProjectTextFile>,
  audit: SeoAuditResult,
  options: { modelId: string; brand?: SeoBrand },
): Promise<SeoCopyResult> {
  const unchanged: SeoCopyResult = {
    files: files as ProjectTextFile[],
    improvements: [],
    skippedReason: null,
  };

  const copyFindings = audit.findings.filter((f) => COPY_FINDING_IDS.has(f.id));
  if (copyFindings.length === 0) return unchanged;

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ...unchanged, skippedReason: "no_api_key" };
  }

  const layout = files.find((f) => LAYOUT_PATHS.has(f.name));
  if (!layout) return { ...unchanged, skippedReason: "no_layout" };

  const context = buildSiteContext(files);
  if (!context.trim()) return { ...unchanged, skippedReason: "no_content" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const result = await generateObject({
      model: getOpenAIModel(options.modelId),
      schema: SeoCopySchema,
      system: [
        "Du skriver SEO-metadata för en svensk webbplats.",
        "Svara på svenska, i samma ton som sajtens egen text.",
        "title: 15-60 tecken. Namnge verksamheten och vad den gör. Ingen slogan utan innehåll.",
        "description: 50-160 tecken. Konkret nytta plus en anledning att klicka. Inga utropstecken, ingen keyword-staplning.",
        "Bygg bara på det som faktiskt står i koden. Hitta inte på orter, priser, omdömen eller certifieringar.",
      ].join("\n"),
      prompt: [
        options.brand?.companyName ? `Varumärke: ${options.brand.companyName}` : null,
        `Brister att åtgärda: ${copyFindings.map((f) => f.id).join(", ")}`,
        "",
        "Sajtens innehåll:",
        context,
      ]
        .filter(Boolean)
        .join("\n"),
      maxOutputTokens: 400,
      maxRetries: 1,
      abortSignal: controller.signal,
    });

    recordLlmUsage({
      phase: "verifier",
      model: options.modelId,
      usage: result.usage,
      durationMs: Date.now() - startedAt,
    });

    const title = result.object.title.trim();
    const description = result.object.description.trim();
    if (!title || !description) {
      return { ...unchanged, skippedReason: "empty_copy" };
    }

    let content = layout.content;
    const improvements: SeoImprovement[] = [];
    const titleFinding = copyFindings.find((f) => f.id.startsWith("title"));
    const descriptionFinding = copyFindings.find((f) => f.id.startsWith("description"));

    if (titleFinding) {
      const next = replaceMetadataString(content, "title", title);
      if (next !== content) {
        content = next;
        improvements.push({
          findingId: titleFinding.id,
          file: layout.name,
          change: `Skrev om sidtiteln till "${title}".`,
          by: "llm",
        });
      }
    }
    if (descriptionFinding) {
      const next = replaceMetadataString(content, "description", description);
      if (next !== content) {
        content = next;
        improvements.push({
          findingId: descriptionFinding.id,
          file: layout.name,
          change: `Skrev om beskrivningen till "${description}".`,
          by: "llm",
        });
      }
    }

    if (improvements.length === 0) return unchanged;

    return {
      files: files.map((f) => (f.name === layout.name ? { name: f.name, content } : f)),
      improvements,
      skippedReason: null,
    };
  } catch (err) {
    console.warn("[seo/llm-copy] Copy pass failed, keeping deterministic result:", err);
    return { ...unchanged, skippedReason: "llm_error" };
  } finally {
    clearTimeout(timeout);
  }
}
