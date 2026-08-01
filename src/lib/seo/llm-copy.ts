/**
 * Optional LLM pass: rewrite the site's title and description.
 *
 * Scope is deliberately narrow. Title and description are two string literals
 * in one metadata object, and they are the two fields that decide whether a
 * search result gets clicked. Alt text and heading structure are NOT touched
 * here: fixing those means rewriting JSX, which turns a copy improvement into
 * a build risk.
 *
 * The model's output is never spliced in as raw source. `writeMetadataString`
 * encodes it with `JSON.stringify` into the exact literal it targets, so a
 * reply containing a newline, a quote or `${` becomes text rather than a
 * syntax error the customer meets as a failed build.
 *
 * Everything degrades to "no change": no API key, a provider error, a refusal,
 * or a reply that fails the schema all leave the deterministic result standing
 * and set `skippedReason` so the report can say why instead of silently
 * looking thinner than it should.
 */

import { generateObject } from "ai";
import { z } from "zod";
import { createDirectModel } from "@/lib/builder/direct-model";
import { recordLlmUsage } from "@/lib/observability/llm-usage";
import { resolveHtmlLang } from "./improve";
import { writeMetadataString } from "./metadata-literal";
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

/**
 * Name the target language for the model.
 *
 * The same locale already decides `<html lang>`, so deriving the copy language
 * from it is what keeps the two from contradicting each other — an `en_US`
 * site used to get a correct `lang="en-US"` and a Swedish title, which tells
 * Google one thing and the reader another.
 */
function describeLanguage(tag: string): string {
  try {
    const names = new Intl.DisplayNames(["en"], { type: "language" });
    const name = names.of(tag);
    if (name && name !== tag) return `${name} (BCP 47: ${tag})`;
  } catch {
    // Intl data for the tag is missing — the tag alone is still unambiguous.
  }
  return `BCP 47: ${tag}`;
}

export async function improveSeoCopyWithLlm(
  files: ReadonlyArray<ProjectTextFile>,
  audit: SeoAuditResult,
  options: { modelId: string; brand?: SeoBrand; language?: string },
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

  const language = resolveHtmlLang(options.language, options.brand?.locale);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const result = await generateObject({
      // `createDirectModel` parses the manifest's `provider/model` form.
      // `getOpenAIModel` would forward `openai/gpt-5.2` verbatim as a model
      // name, so every call would fail and silently degrade to no rewrite.
      model: createDirectModel(options.modelId),
      schema: SeoCopySchema,
      system: [
        "Du skriver SEO-metadata för en webbplats.",
        `Skriv title och description på detta språk: ${describeLanguage(language)}. Det är sajtens eget språk — översätt inte till svenska.`,
        "Håll samma ton som sajtens egen text.",
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

    let content = layout.content;
    const improvements: SeoImprovement[] = [];
    const titleFinding = copyFindings.find((f) => f.id.startsWith("title"));
    const descriptionFinding = copyFindings.find((f) => f.id.startsWith("description"));

    // Judge the two fields separately. The schema always asks for both, so a
    // reply can be exactly right for the field the audit flagged and empty for
    // the one it did not — rejecting the whole reply then throws away a real
    // fix over a field we were never going to write.
    const usableTitle = titleFinding && title ? title : null;
    const usableDescription = descriptionFinding && description ? description : null;
    if (!usableTitle && !usableDescription) {
      return { ...unchanged, skippedReason: "empty_copy" };
    }

    if (usableTitle && titleFinding) {
      const next = writeMetadataString(content, "title", title);
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
    if (usableDescription && descriptionFinding) {
      const next = writeMetadataString(content, "description", description);
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
