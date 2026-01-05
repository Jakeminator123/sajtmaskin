/**
 * Semantic Router (AI SDK 6)
 * ==========================
 *
 * Smart intent-klassificering som analyserar ALLA prompts semantiskt.
 * Använder gpt-4o-mini (billig: ~$0.15/1M tokens) för att förstå
 * vad användaren VERKLIGEN vill göra.
 *
 * ROLL I PIPELINEN:
 * - Klassificerar intent (simple_code, needs_code_context, etc.)
 * - Bestämmer om Code Crawler ska köras
 * - Extraherar hints för kodsökning
 *
 * INTENT-TYPER:
 * - simple_code: Enkla kodändringar ("gör bakgrunden blå")
 * - needs_code_context: Kräver kodanalys ("länken i headern")
 * - web_search: Webbsökning ("kolla på apple.com")
 * - image_gen: Bildgenerering ("snygg bakgrundsbild")
 * - web_and_code: Kombination ("gör som spotify.com")
 * - image_and_code: Bild + kod ("hero-bild med solnedgång")
 * - clarify: Otydligt, behöver förtydligande
 * - chat_response: Bara svara, ingen action
 */

import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";

// ============================================================================
// TYPES
// ============================================================================

export type SemanticIntent =
  | "simple_code" // Direct to v0, no extra context needed
  | "needs_code_context" // Needs Code Crawler analysis first
  | "web_search" // Web search only, return info
  | "image_gen" // Image generation only
  | "web_and_code" // Web search + code changes
  | "image_and_code" // Image generation + code changes
  | "clarify" // Need to ask user for clarification
  | "chat_response"; // Just respond, no action

export interface RouterResult {
  intent: SemanticIntent;
  confidence: number; // 0-1, how confident the router is
  needsCodeContext: boolean; // Should we run Code Crawler?
  contextHints: string[]; // Hints for Code Crawler ["header", "nav", "Products"]
  searchQuery?: string; // Web search query if needed
  imagePrompt?: string; // Image generation prompt if needed
  codeInstruction?: string; // Instruction to pass to v0
  clarifyQuestion?: string; // Question to ask user
  chatResponse?: string; // Response if just chatting
  reasoning: string; // Why this intent was chosen
}

// Valid intents for validation
const VALID_INTENTS: SemanticIntent[] = [
  "simple_code",
  "needs_code_context",
  "web_search",
  "image_gen",
  "web_and_code",
  "image_and_code",
  "clarify",
  "chat_response",
];

// ============================================================================
// CONFIGURATION
// ============================================================================

// Model for routing - must be cheap and fast
const ROUTER_MODEL = "gpt-4o-mini";

// ============================================================================
// MAIN ROUTER FUNCTION
// ============================================================================

/**
 * Route a prompt to determine the best action to take.
 *
 * @param prompt - User's prompt
 * @param hasExistingCode - Whether there's existing code in the project
 * @returns RouterResult with intent and supporting data
 */
export async function routePrompt(
  prompt: string,
  hasExistingCode: boolean = true
): Promise<RouterResult> {
  console.log("[SemanticRouter] Routing prompt:", prompt.substring(0, 100));

  // System prompt for intent classification
  const systemPrompt = `You are a semantic intent-router for an AI website builder.
Analyze the user's message (in Swedish) and determine the required action.

CRITICAL - CREATING/BUILDING PAGES = CODE:
- "skapa en sida om X" = simple_code (generate webpage about X)
- "bygg en webbplats" = simple_code (generate website)
- All requests to CREATE/BUILD a page/website = simple_code

AVAILABLE INTENTS:

1. "simple_code" - Simple code changes OR new website/page
   Examples: "make background blue", "change font size", "create a page about cars"
   Triggered by: General styling changes OR creating new page/website

2. "needs_code_context" - Changes referencing SPECIFIC EXISTING elements
   Examples: "change the link in the header", "that button", "the product section"
   Triggered by: Demonstrative pronouns (den, det, där) or specific component names
   CRITICAL: Only when user points to a SPECIFIC existing element

3. "web_search" - User wants INFORMATION from external website
   Examples: "check apple.com", "look for inspiration", "how does spotify look"
   NOT: "create a page about cars" (that's simple_code!)

4. "image_gen" - User wants ONLY to generate an image (not insert it)
   Examples: "create an image of cheese", "generate a logo"

5. "web_and_code" - Web search AND code changes
   Examples: "make it like apple.com", "copy style from spotify"

6. "image_and_code" - Image generation AND insert into code
   Examples: "add a hero image with sunset", "background image with mountains"

7. "clarify" - Unclear what user wants
   Examples: "yes", "ok", "hmm", "change the link" (multiple links exist)
   If prompt references code elements but is vague, set needsCodeContext=true

8. "chat_response" - User asks a question, wants an answer
   Examples: "what is Next.js?", "how does routing work?"

CONTEXT: ${
    hasExistingCode
      ? "User HAS an existing website."
      : "User has NO website yet."
  }

Respond with EXACT JSON (no markdown):
{
  "intent": "simple_code" | "needs_code_context" | "web_search" | "image_gen" | "web_and_code" | "image_and_code" | "clarify" | "chat_response",
  "confidence": 0.0-1.0,
  "needsCodeContext": true/false,
  "contextHints": ["hint1", "hint2"],
  "searchQuery": "search query or empty string",
  "imagePrompt": "image prompt or empty string",
  "codeInstruction": "instruction for v0 or empty string",
  "clarifyQuestion": "question for user (in Swedish) or empty string",
  "chatResponse": "response to user (in Swedish) or empty string",
  "reasoning": "Brief explanation in Swedish"
}`;

  try {
    // Use AI SDK 6 generateText
    const aiResult = await generateText({
      model: openai(ROUTER_MODEL),
      system: systemPrompt,
      prompt: prompt,
      maxOutputTokens: 500,
    });

    let responseText = aiResult.text || "{}";
    console.log(
      "[SemanticRouter] Raw response:",
      responseText.substring(0, 500)
    );

    // Extract JSON if wrapped in markdown
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      responseText = jsonMatch[1].trim();
    }

    // Find JSON object if not at start
    const jsonObjectMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch && !responseText.trim().startsWith("{")) {
      responseText = jsonObjectMatch[0];
    }

    // Parse and validate
    const parsed = JSON.parse(responseText);

    // Validate intent
    const intent: SemanticIntent = VALID_INTENTS.includes(parsed.intent)
      ? parsed.intent
      : "clarify";

    const routerResult: RouterResult = {
      intent,
      confidence:
        typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      needsCodeContext: Boolean(parsed.needsCodeContext),
      contextHints: Array.isArray(parsed.contextHints)
        ? parsed.contextHints
        : [],
      searchQuery: parsed.searchQuery || undefined,
      imagePrompt: parsed.imagePrompt || undefined,
      codeInstruction: parsed.codeInstruction || undefined,
      clarifyQuestion: parsed.clarifyQuestion || undefined,
      chatResponse: parsed.chatResponse || undefined,
      reasoning: parsed.reasoning || "Ingen förklaring",
    };

    // Compact one-liner log
    console.log(
      `[SemanticRouter] → ${routerResult.intent} (${Math.round(
        routerResult.confidence * 100
      )}%)` +
        (routerResult.needsCodeContext
          ? ` [needs context: ${routerResult.contextHints.join(", ")}]`
          : "")
    );

    return routerResult;
  } catch (error) {
    console.error("[SemanticRouter] Error:", error);

    // Fallback to simple_code if routing fails
    return {
      intent: "simple_code",
      confidence: 0.3,
      needsCodeContext: false,
      contextHints: [],
      codeInstruction: prompt,
      reasoning: "Fallback pga routing-fel",
    };
  }
}

// ============================================================================
// HELPER: Check if prompt likely needs routing
// ============================================================================

/**
 * Quick check if a prompt should go through semantic routing.
 * Returns false for very simple prompts to save API calls.
 *
 * Note: This is a heuristic, not a guarantee. When in doubt, route.
 */
export function shouldRoute(prompt: string): boolean {
  const lower = prompt.toLowerCase();

  // Very short prompts - always route (might need clarification)
  // Increased threshold to catch more vague prompts
  if (prompt.trim().length < 15) {
    return true;
  }

  // Vague/unclear words that suggest user needs help clarifying
  if (
    lower.includes("lite") ||
    lower.includes("något") ||
    lower.includes("saker") ||
    lower.includes("grejer") ||
    lower.includes("snyggare") ||
    lower.includes("bättre")
  ) {
    return true;
  }

  // Contains URL - likely needs web search
  if (
    lower.includes("http") ||
    lower.includes("www.") ||
    lower.includes(".com")
  ) {
    return true;
  }

  // Contains image-related words
  if (
    lower.includes("bild") ||
    lower.includes("image") ||
    lower.includes("foto") ||
    lower.includes("logo") ||
    lower.includes("illustration")
  ) {
    return true;
  }

  // References to specific elements (demonstrative pronouns)
  if (
    lower.includes("den ") ||
    lower.includes("det ") ||
    lower.includes("där") ||
    lower.includes("denna") ||
    lower.includes("detta") ||
    lower.includes("headern") ||
    lower.includes("navbaren") ||
    lower.includes("footern") ||
    lower.includes("knappen") ||
    lower.includes("länken")
  ) {
    return true;
  }

  // Questions
  if (
    lower.includes("vad ") ||
    lower.includes("hur ") ||
    lower.includes("varför ") ||
    lower.includes("?")
  ) {
    return true;
  }

  // Web search indicators
  if (
    lower.includes("kolla") ||
    lower.includes("titta") ||
    lower.includes("inspiration") ||
    lower.includes("som ") ||
    lower.includes("liknande")
  ) {
    return true;
  }

  // Default: Simple prompts can go directly to v0
  return false;
}
