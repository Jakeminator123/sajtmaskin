/**
 * LLM-based scaffold classifier — fallback when keyword + embedding
 * matching yields low confidence on init generations.
 *
 * Uses a fast, cheap model to reason about which scaffold best fits
 * the user's prompt, brief, and detected capabilities.
 */
import OpenAI from "openai";
import { SECRETS } from "@/lib/config";
import type { InferredCapabilities } from "@/lib/gen/capability-inference";
import type { BuildIntent } from "@/lib/builder/build-intent";
import { getAllScaffolds } from "./registry";

export interface ScaffoldClassification {
  scaffoldId: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

const CLASSIFY_TIMEOUT_MS = 3_000;
const CLASSIFY_MODEL = "gpt-4o-mini";
const CLASSIFY_MAX_TOKENS = 150;

function isLlmClassifyDisabled(): boolean {
  const v = process.env.SAJTMASKIN_SCAFFOLD_LLM_CLASSIFY?.trim().toLowerCase();
  if (!v) return false;
  return v === "0" || v === "false" || v === "off" || v === "disabled";
}

function summarizeBrief(brief: Record<string, unknown> | null): string {
  if (!brief) return "No brief available.";
  const parts: string[] = [];
  const desc = brief.description ?? brief.concept ?? brief.purpose;
  if (typeof desc === "string" && desc.trim()) parts.push(desc.trim());
  const pages = brief.pages;
  if (Array.isArray(pages) && pages.length > 0) {
    const pageNames = pages
      .slice(0, 8)
      .map((p: unknown) => {
        if (typeof p === "object" && p !== null) {
          const pg = p as Record<string, unknown>;
          return [pg.name, pg.path, pg.purpose].filter(Boolean).join(" - ");
        }
        return String(p);
      })
      .filter(Boolean);
    if (pageNames.length > 0) parts.push(`Pages: ${pageNames.join("; ")}`);
  }
  const bType = brief.businessType;
  if (typeof bType === "string" && bType.trim()) parts.push(`Business type: ${bType}`);
  return parts.length > 0 ? parts.join("\n") : "No brief available.";
}

function summarizeCapabilities(caps: InferredCapabilities): string {
  const active = Object.entries(caps)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  return active.length > 0 ? active.join(", ") : "none";
}

function buildCandidateList(): Array<{ id: string; label: string; description: string }> {
  return getAllScaffolds().map((s) => ({
    id: s.id,
    label: s.label,
    description: s.description,
  }));
}

const SYSTEM_PROMPT = `You are a scaffold classifier for a website builder. Given a user prompt, an optional brief, detected capabilities, and a list of scaffold candidates, select the scaffold that best matches the website the user wants to build.

Respond with valid JSON only:
{"scaffoldId": "<id>", "confidence": "high"|"medium"|"low", "reasoning": "<one sentence>"}

Rules:
- Pick the scaffold whose structure and purpose best fits the user's intent.
- If the user describes a documentation or knowledge base site, prefer docs-knowledge.
- If the user describes booking, surveys, quizzes, or multi-step forms, prefer form-workflow.
- If no scaffold is a clear fit, use landing-page with confidence "low".
- Be concise in reasoning.`;

export async function classifyScaffoldWithLlm(params: {
  prompt: string;
  brief: Record<string, unknown> | null;
  capabilities: InferredCapabilities;
  buildIntent: BuildIntent;
}): Promise<ScaffoldClassification | null> {
  if (isLlmClassifyDisabled()) return null;

  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) return null;

  const candidates = buildCandidateList();
  const candidateText = candidates
    .map((c) => `- ${c.id}: ${c.label} — ${c.description}`)
    .join("\n");

  const userContent = [
    `User prompt: ${params.prompt}`,
    `Build intent: ${params.buildIntent}`,
    `Brief: ${summarizeBrief(params.brief)}`,
    `Detected capabilities: ${summarizeCapabilities(params.capabilities)}`,
    `\nAvailable scaffolds:\n${candidateText}`,
  ].join("\n\n");

  const openai = new OpenAI({ apiKey });
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(CLASSIFY_TIMEOUT_MS)
      : undefined;

  try {
    const response = await openai.chat.completions.create(
      {
        model: CLASSIFY_MODEL,
        max_tokens: CLASSIFY_MAX_TOKENS,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      },
      signal ? { signal } : undefined,
    );

    const text = response.choices[0]?.message?.content?.trim();
    if (!text) return null;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const scaffoldId = typeof parsed.scaffoldId === "string" ? parsed.scaffoldId : null;
    if (!scaffoldId) return null;

    const validIds = new Set(candidates.map((c) => c.id));
    if (!validIds.has(scaffoldId)) return null;

    const confidence =
      parsed.confidence === "high" || parsed.confidence === "medium" || parsed.confidence === "low"
        ? (parsed.confidence as "high" | "medium" | "low")
        : "medium";
    const reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : "";

    console.info("[scaffold-llm-classify] result", { scaffoldId, confidence, reasoning });
    return { scaffoldId, confidence, reasoning };
  } catch (err) {
    console.warn("[scaffold-llm-classify] failed, falling back to heuristic", {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
