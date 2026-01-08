/**
 * Semantic Router (AI SDK 6)
 * ==========================
 *
 * ╔════════════════════════════════════════════════════════════════════════════╗
 * ║  DEL AV DITT EGNA ORKESTRATORSYSTEM                                        ║
 * ║                                                                            ║
 * ║  Denna fil är en CENTRAL del av ditt hemmabyggda prompt-behandlingssystem. ║
 * ║  Den använder AI SDK som VERKTYG för att anropa OpenAI, men ALL LOGIK      ║
 * ║  (intent-typer, klassificering, hints) är DIN EGEN KOD.                    ║
 * ║                                                                            ║
 * ║  TEKNISK INFO:                                                             ║
 * ║  - Använder: AI SDK (paketet 'ai') - open-source, fungerar utan Vercel     ║
 * ║  - Anropar: OpenAI API direkt via din OPENAI_API_KEY                       ║
 * ║  - Modell: gpt-4o-mini (~$0.15/1M tokens)                                  ║
 * ║                                                                            ║
 * ║  AI SDK är INTE samma sak som Vercel AI Gateway!                           ║
 * ║  - AI SDK = bibliotek för att anropa AI-modeller (open-source)             ║
 * ║  - AI Gateway = Vercel-tjänst för att aggregera providers (kräver konto)   ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
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
import { createOpenAI } from "@ai-sdk/openai";
import { debugLog, truncateForLog } from "@/lib/utils/debug";
import { SECRETS } from "@/lib/config";

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
  debugLog(
    "Router",
    "[SemanticRouter] Routing prompt:",
    truncateForLog(prompt, 200, "prompt")
  );

  // System prompt for intent classification
  const systemPrompt = `You are a semantic intent-router for an AI website builder.
Analyze the user's message (in Swedish) and determine the required action.

CRITICAL - CREATING/BUILDING PAGES = CODE:
- "skapa en sida om X" = simple_code (generate webpage about X)
- "bygg en webbplats" = simple_code (generate website)
- All requests to CREATE/BUILD a page/website = simple_code

CRITICAL - IMAGE GENERATION VS CODE:
- "generera en bild" / "skapa en bild" / "spara i mediabibliotek" = image_gen (ONLY generate, NO code)
- "lägg till en bild i sajten" / "sätt in bilden" = image_and_code (generate AND insert)
- "använd bilder från bildbiblioteket" / "ta bilder från mediabank" = simple_code (use EXISTING images, NO generation)

CRITICAL - ANIMATIONS/EFFECTS = CODE, NOT IMAGE:
- "animerade element" / "animation" / "rörelse" / "rörande" = simple_code (CSS/JS animation)
- "overlay" / "överlägg" / "flytande element" = simple_code (CSS overlay)
- "svartvit" / "färgfilter" / "grayscale" = simple_code (CSS filter)
- "åker omkring" / "svävande" / "bounce" = simple_code (CSS keyframe animation)
- ANY description of visual EFFECTS on existing elements = simple_code, NOT image_gen

AVAILABLE INTENTS:

1. "simple_code" - Simple code changes OR new website/page OR use existing media
   Examples: "make background blue", "create a page about cars", "use images from my media library"
   Triggered by: General styling, creating pages, OR using EXISTING uploaded/generated images

2. "needs_code_context" - Changes referencing SPECIFIC EXISTING elements
   Examples: "change the link in the header", "that button", "the product section"
   Triggered by: Demonstrative pronouns (den, det, där) or specific component names
   CRITICAL: Only when user points to a SPECIFIC existing element

3. "web_search" - User wants INFORMATION from external website
   Examples: "check apple.com", "look for inspiration", "how does spotify look"
   NOT: "create a page about cars" (that's simple_code!)

4. "image_gen" - User wants ONLY to generate a STATIC image (show in chat, save to media library)
   Examples: "skapa en bild på ost", "generera en logotyp", "spara en bild i mediabiblioteket"
   CRITICAL: This does NOT change the website code! Just generates and displays the image.
   CRITICAL: ONLY use image_gen when user EXPLICITLY says "generera bild", "skapa en bild", etc.
   DO NOT use image_gen for: animations, overlays, effects, filters, moving elements - those are CODE!
   Keywords that TRIGGER image_gen: "generera bild", "skapa bild", "rita bild", "spara bild", "mediabibliotek"
   Keywords that DO NOT trigger image_gen: "animerade", "rörande", "overlay", "svartvit", "filter", "effekt"

5. "web_and_code" - Web search AND code changes
   Examples: "make it like apple.com", "copy style from spotify"

6. "image_and_code" - Generate NEW STATIC image AND insert into website code
   Examples: "lägg till en herobild med solnedgång", "sätt in en bakgrundsbild med berg"
   CRITICAL: User explicitly wants a GENERATED image IN the website, not just in media library.
   CRITICAL: ONLY use when user wants a NEW generated image - NOT for animations/effects!
   Keywords that TRIGGER: "lägg till bild", "sätt in bild", "bakgrundsbild", "herobild"
   DO NOT use for: animations, overlays, visual effects - those are simple_code!

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
    // CRITICAL: Validate API key BEFORE creating client (fail fast)
    const apiKey = SECRETS.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required for Semantic Router. Please set it in environment variables."
      );
    }

    // Create OpenAI client with validated API key
    const openaiClient = createOpenAI({ apiKey });

    // Use AI SDK 6 generateText with explicitly configured client
    const aiResult = await generateText({
      model: openaiClient(ROUTER_MODEL),
      system: systemPrompt,
      prompt: prompt,
      maxOutputTokens: 500,
    });

    let responseText = aiResult.text || "{}";
    console.log(
      "[SemanticRouter] Raw response:",
      truncateForLog(responseText, 500, "router-response")
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

  // FAST-PATH: Very clear, simple prompts that don't need routing
  // These patterns indicate straightforward code changes that can skip AI routing
  const fastPathPatterns = [
    // Simple deletions: "ta bort X", "ta bort Y", "radera Z"
    /^ta\s+bort\s+\w+/i,
    /^radera\s+\w+/i,
    /^ta\s+bort\s+.*$/i,

    // Simple color changes: "ändra färg på X till Y", "gör X blå"
    /^(ändra|gör|sätt)\s+(färg|bakgrund)\s+(på\s+)?\w+\s+(till\s+)?\w+/i,
    /^gör\s+\w+\s+(blå|röd|grön|gul|svart|vit|grå)/i,

    // Simple size changes: "gör X större", "ändra storlek på Y"
    /^(gör|ändra)\s+\w+\s+(större|mindre|storlek)/i,

    // Simple visibility: "dölj X", "visa Y"
    /^(dölj|visa|göm)\s+\w+/i,

    // Simple additions: "lägg till X" (when X is specific)
    /^lägg\s+till\s+\w+\s+(med|som|till)/i,
  ];

  // If prompt matches fast-path pattern and is short enough, skip routing
  if (
    fastPathPatterns.some((pattern) => pattern.test(prompt)) &&
    prompt.length < 100
  ) {
    return false;
  }

  // Vague/unclear words that suggest user needs help clarifying
  // These prompts should ALWAYS go through semantic router to potentially ask clarifying questions
  if (
    lower.includes("lite") ||
    lower.includes("något") ||
    lower.includes("saker") ||
    lower.includes("grejer") ||
    lower.includes("snyggare") ||
    lower.includes("bättre") ||
    lower.includes("typ") ||
    lower.includes("liksom") ||
    lower.includes("kanske") ||
    lower.includes("ungefär") ||
    lower.includes("liknande") ||
    lower.includes("sånt") ||
    lower.includes("nåt") ||
    lower.includes("vet inte") ||
    lower.includes("oklart") ||
    lower.includes("osäker")
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
