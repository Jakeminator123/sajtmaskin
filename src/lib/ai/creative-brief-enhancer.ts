/**
 * Creative Brief Enhancer
 * =======================
 *
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║  DEL AV DITT EGNA ORKESTRATORSYSTEM                                        ║
 * ║                                                                            ║
 * ║  Använder: AI SDK (paketet 'ai') - open-source, fungerar utan Vercel       ║
 * ║  Anropar: OpenAI API direkt via din OPENAI_API_KEY                         ║
 * ║  Modell: gpt-4o-mini (snabb) eller gpt-4o (bäst)                           ║
 * ║                                                                            ║
 * ║  AI SDK ≠ Vercel AI Gateway (helt olika saker!)                            ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════════════════════════════════════════════
 * WHEN TO USE THIS MODULE:
 * ═══════════════════════════════════════════════════════════════
 *
 * This module is used AUTOMATICALLY by the orchestrator when:
 * - User provides FREE TEXT prompts (not from wizard)
 * - Prompt is for a NEW website (no existingCode)
 * - Prompt is vague/underspecified and needs enhancement
 *
 * ═══════════════════════════════════════════════════════════════
 * ALTERNATIVE: /api/expand-prompt
 * ═══════════════════════════════════════════════════════════════
 *
 * For WIZARD-BASED prompts (user goes through PromptWizardModalV2),
 * use /api/expand-prompt instead. That API provides:
 * - More comprehensive expansion with industry trends
 * - Unsplash image fetching
 * - Web search integration
 * - More detailed prompts
 *
 * ═══════════════════════════════════════════════════════════════
 * FLOW:
 * ═══════════════════════════════════════════════════════════════
 *
 * Free Text Flow:
 *   User → ChatPanel → Orchestrator → creative-brief-enhancer → Builder
 *
 * Wizard Flow:
 *   User → PromptWizardModalV2 → /api/expand-prompt → Builder
 *
 * ═══════════════════════════════════════════════════════════════
 *
 * Purpose:
 * Turn vague/new-website prompts into a v0-optimized design brief (like /api/expand-prompt),
 * even when the user starts from templates or free text.
 *
 * Behavior:
 * - If the input is too vague/underspecified: return 1–3 clarifying questions (Swedish).
 * - Otherwise: return an expanded, structured prompt (English) tailored for v0.
 *
 * Notes:
 * - Keep the expanded prompt concise (< ~2500 chars) but specific.
 * - Prefer concrete Tailwind tokens, layout structure, and UX details.
 */

import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { RouterResult } from "@/lib/ai/semantic-router";
import type { QualityLevel } from "@/lib/api-client";
import { SECRETS } from "@/lib/config";

const FAST_MODEL = "gpt-4o-mini";
const BEST_MODEL = "gpt-4o";

export type CreativeBriefResult =
  | {
      mode: "clarify";
      questions: string[];
      reasoning: string;
    }
  | {
      mode: "expand";
      expandedPrompt: string;
      reasoning: string;
      inferred: {
        industry: string | null;
        audience: string | null;
        vibe: string[];
      };
    };

function looksLikeAlreadyExpanded(prompt: string): boolean {
  const p = prompt.trim();
  if (!p) return false;
  const lower = p.toLowerCase();
  return (
    lower.startsWith("create a ") ||
    lower.startsWith("build a ") ||
    lower.includes("hero section") ||
    lower.includes("navigation") ||
    lower.includes("styling requirements") ||
    lower.includes("website requirements")
  );
}

function isTooVague(prompt: string): boolean {
  const p = prompt.trim();
  if (p.length < 25) return true;
  const lower = p.toLowerCase();
  // Very common vague intents
  const vague =
    /(^gör (en )?hemsida$)|(^build (a )?website$)|(^create (a )?website$)/i.test(
      lower
    );
  return vague;
}

function sanitizeExpandedPrompt(text: string): string {
  let out = text.trim();

  // Remove code fences if model wraps response
  out = out
    .replace(/^```[\s\S]*?\n/, "")
    .replace(/```$/g, "")
    .trim();

  // If the model returned JSON as a string, extract expandedPrompt
  // This prevents JSON from leaking into the final prompt
  if (out.startsWith("{") && out.includes('"expandedPrompt"')) {
    try {
      const parsed = JSON.parse(out);
      if (parsed.expandedPrompt) {
        out = String(parsed.expandedPrompt).trim();
      }
    } catch {
      // Not valid JSON, continue with original text
    }
  }

  // Ensure it starts correctly for v0
  if (!/^(\s*)(Create a|Build a)/i.test(out)) {
    out = `Create a modern, responsive website.\n\n${out}`.trim();
  }

  // Hard trim to avoid runaway outputs
  if (out.length > 2600) out = out.slice(0, 2600);
  return out;
}

export async function creativeBriefEnhance(options: {
  userPrompt: string;
  routerResult?: RouterResult;
  quality?: QualityLevel;
}): Promise<CreativeBriefResult | null> {
  const { userPrompt, routerResult, quality } = options;

  // Only for new-site prompts. If the user already provides a full brief, skip.
  if (looksLikeAlreadyExpanded(userPrompt)) return null;

  const system = `You are a senior product designer + prompt engineer for v0 (Vercel).

Goal:
Transform the user's request into either:
1) A short set of clarifying questions (in Swedish), if critical info is missing.
2) Otherwise: a compact, highly specific v0-ready prompt (in English) that generates a beautiful website in Next.js + Tailwind.

Rules:
- If output is a prompt for v0: WRITE IN ENGLISH ONLY.
- If output is clarifying questions: WRITE IN SWEDISH ONLY and keep to 1–3 questions.
- Be creative but realistic: infer the likely audience and vibe from context.
- Include structure: hero, navigation, key sections, CTA, footer.
- Include styling constraints: CSS variables (--primary/--secondary/--accent), transitions, shadows, spacing, rounded corners.
- Keep expanded prompt under ~2500 characters.
- Output MUST be strict JSON only with one of these shapes:
  { "mode": "clarify", "questions": ["..."], "reasoning": "..." }
  { "mode": "expand", "expandedPrompt": "...", "reasoning": "...", "inferred": { "industry": "...|null", "audience": "...|null", "vibe": ["..."] } }`;

  const user = `USER PROMPT:
${userPrompt}

ROUTER CODE INSTRUCTION (if any):
${routerResult?.codeInstruction || ""}
`.trim();

  // If prompt is extremely vague, bias toward clarify.
  const maxOutputTokens = isTooVague(userPrompt) ? 260 : 700;

  const chosenModel = quality === "premium" ? BEST_MODEL : FAST_MODEL;

  // CRITICAL: Validate API key BEFORE creating client (fail fast)
  const apiKey = SECRETS.openaiApiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required for Creative Brief Enhancer. Please set it in environment variables."
    );
  }

  // Create OpenAI client with validated API key
  const openaiClient = createOpenAI({ apiKey });

  let raw: string | null = null;
  try {
    const result = await generateText({
      model: openaiClient(chosenModel),
      system,
      prompt: user,
      maxOutputTokens,
    });
    raw = result.text.trim();
  } catch (e) {
    // Fallback to fast model if best model fails
    if (chosenModel !== FAST_MODEL) {
      const result = await generateText({
        model: openaiClient(FAST_MODEL),
        system,
        prompt: user,
        maxOutputTokens,
      });
      raw = result.text.trim();
    } else {
      throw e;
    }
  }

  try {
    const parsed = JSON.parse(raw) as CreativeBriefResult;
    if (parsed.mode === "clarify") {
      const questions = Array.isArray(parsed.questions)
        ? parsed.questions
            .map((q) => String(q))
            .filter(Boolean)
            .slice(0, 3)
        : [];
      if (questions.length === 0) {
        return {
          mode: "clarify",
          questions: [
            "Vilken typ av verksamhet gäller det (bransch) och vad är målet med hemsidan?",
          ],
          reasoning: "Fallback clarify questions",
        };
      }
      return { ...parsed, questions };
    }

    if (parsed.mode === "expand") {
      const expandedPrompt = sanitizeExpandedPrompt(
        String((parsed as { expandedPrompt?: unknown }).expandedPrompt || "")
      );
      const inferredRaw = (parsed as { inferred?: unknown }).inferred;
      const inferred =
        inferredRaw && typeof inferredRaw === "object"
          ? (inferredRaw as {
              industry?: string | null;
              audience?: string | null;
              vibe?: string[];
            })
          : { industry: null, audience: null, vibe: [] };

      return {
        mode: "expand",
        expandedPrompt,
        reasoning: String((parsed as { reasoning?: unknown }).reasoning || ""),
        inferred: {
          industry:
            typeof inferred.industry === "string" ? inferred.industry : null,
          audience:
            typeof inferred.audience === "string" ? inferred.audience : null,
          vibe: Array.isArray(inferred.vibe)
            ? inferred.vibe.map(String).filter(Boolean).slice(0, 6)
            : [],
        },
      };
    }
  } catch {
    // Fallback: treat as expanded prompt text
    return {
      mode: "expand",
      expandedPrompt: sanitizeExpandedPrompt(raw),
      reasoning: "Non-JSON fallback",
      inferred: { industry: null, audience: null, vibe: [] },
    };
  }

  // If shape is unknown, do a safe fallback.
  return {
    mode: "expand",
    expandedPrompt: sanitizeExpandedPrompt(raw),
    reasoning: "Unknown shape fallback",
    inferred: { industry: null, audience: null, vibe: [] },
  };
}
