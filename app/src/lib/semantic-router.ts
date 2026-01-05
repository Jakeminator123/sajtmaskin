/**
 * Semantic Router
 * ================
 *
 * Smart intent-klassificering som analyserar ALLA prompts semantiskt.
 * Använder gpt-4o-mini (billig: ~$0.15/1M tokens) för att förstå
 * vad användaren VERKLIGEN vill göra.
 *
 * SKILLNAD MOT GAMLA ORCHESTRATORN:
 * - Gammal: Keyword-baserad ("generera bild" → image)
 * - Ny: Semantisk ("fixa en snygg bakgrund" → image)
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

import OpenAI from "openai";

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

// ============================================================================
// CONFIGURATION
// ============================================================================

// Model for routing - must be cheap and fast
const ROUTER_MODEL = "gpt-4o-mini";

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
// OPENAI CLIENT
// ============================================================================

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

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

  const client = getOpenAIClient();

  const systemPrompt = `Du är en semantisk intent-router för en AI-driven webbplatsbyggare.

Din uppgift är att analysera användarens meddelande och bestämma VILKEN ÅTGÄRD som krävs.

KRITISKT - SKAPA/BYGGA SIDOR = KOD:
- "skapa en sida om X" = simple_code (generera webbsida om X)
- "bygg en webbplats om Y" = simple_code (generera webbplats om Y)
- "gör en landningssida för Z" = simple_code (generera kod)
- "sida som handlar om bilar" = simple_code (INTE web_search!)
- ALLA requests som vill SKAPA/BYGGA/GÖRA en sida/webbplats = simple_code
- Innehållet (bilar, mat, etc.) ska inkluderas i codeInstruction till v0

TILLGÄNGLIGA INTENTS:

1. "simple_code" - ENKLA kodändringar eller NY WEBBPLATS/SIDA
   Exempel: "gör bakgrunden blå", "ändra fontstorleken till 18px", "lägg till padding", "ändra färgen till röd"
   Exempel: "skapa en sida om bilar", "bygg en portfolio", "gör en restaurangsida"
   Triggas av: Generella styling-ändringar ELLER skapande av ny sida/webbplats
   VIKTIGT: "gör bakgrunden blå" = simple_code (ingen specifik referens)
   VIKTIGT: "lägg till en knapp" = simple_code (generell instruktion)
   VIKTIGT: "skapa en sida om X" = simple_code (generera kod för sida om X)

2. "needs_code_context" - Ändringar som REFERERAR till SPECIFIKA EXISTERANDE element
   Exempel: "ändra länken i headern", "den där knappen", "produktsektionen", "CTA-knappen i hero"
   Triggas av: Demonstrativa pronomen (den, det, där) eller specifika komponentnamn
   KRITISKT: Endast när användaren pekar på ETT SPECIFIKT existerande element
   VIKTIGT: "ändra headern" = needs_code_context (specifik komponent)
   VIKTIGT: "gör knappen i footern grön" = needs_code_context (specifik plats)

3. "web_search" - Användaren vill ha INFORMATION från en extern webbplats
   Exempel: "kolla på apple.com", "sök efter inspiration", "hur ser spotify ut"
   Triggas av: Webbadresser, "kolla", "titta på", "inspiration från", "som [sajt]"
   INTE: "skapa en sida om bilar" (det är simple_code!)
   INTE: "bygg en sida som handlar om X" (det är simple_code!)

4. "image_gen" - Användaren vill BARA generera en bild (inte lägga in den)
   Exempel: "skapa en bild på en ost", "generera en logo"
   Triggas av: Explicit bildgenerering utan kod-kontext

5. "web_and_code" - Webbsökning OCH kodändringar
   Exempel: "gör som apple.com", "kopiera stilen från spotify"
   Triggas av: Referens till extern sajt + vilja att ändra egen kod

6. "image_and_code" - Bildgenerering OCH infoga i koden
   Exempel: "lägg till en hero-bild med solnedgång", "bakgrundsbild med berg"
   Triggas av: Bildgenerering + placering i specifik sektion

7. "clarify" - Otydligt vad användaren vill
   Exempel: "ja", "ok", "hmm", "ändra länken" (flera länkar finns)
   Triggas av: För kort/vagt meddelande ELLER vaga referenser till element när flera alternativ finns
   SMART CLARIFY: Om prompten verkar referera till kod-element (länk, knapp, etc.) men är vag → 
   sätt needsCodeContext=true så att Code Crawler kan hitta alla alternativ

8. "chat_response" - Användaren ställer en fråga, vill ha svar
   Exempel: "vad är Next.js?", "hur fungerar routing?"
   Triggas av: Frågor som inte kräver kodändringar

KONTEXT:
${hasExistingCode ? "Användaren HAR en befintlig webbplats." : "Användaren har INGEN webbplats ännu."}

SVARA MED EXAKT JSON (ingen markdown):
{
  "intent": "simple_code" | "needs_code_context" | "web_search" | "image_gen" | "web_and_code" | "image_and_code" | "clarify" | "chat_response",
  "confidence": 0.0-1.0,
  "needsCodeContext": true/false,
  "contextHints": ["hint1", "hint2"],
  "searchQuery": "sökfråga eller tom sträng",
  "imagePrompt": "bildprompt eller tom sträng",
  "codeInstruction": "instruktion till v0 eller tom sträng",
  "clarifyQuestion": "fråga till användaren eller tom sträng",
  "chatResponse": "svar till användaren eller tom sträng",
  "reasoning": "Kort förklaring på svenska"
}

REGLER:
- needsCodeContext = true OM användaren refererar till specifika element
- SMART CLARIFY: För clarify-intent, sätt needsCodeContext=true om prompten verkar referera till kod-element 
  (t.ex. "ändra länken", "den knappen", "headern") - även om det är vagt. Detta aktiverar Smart Clarify.
- contextHints = lista med nyckelord för att hitta rätt kod (t.ex. ["header", "nav", "Products"])
- confidence ska vara lägre om meddelandet är vagt
- Om intent är clarify, fyll i clarifyQuestion (kan vara tom om Smart Clarify ska generera frågan)
- Om intent är chat_response, fyll i chatResponse`;

  try {
    const response = await client.responses.create({
      model: ROUTER_MODEL,
      instructions: systemPrompt,
      input: prompt,
      store: false, // Don't store routing decisions
    });

    let responseText = response.output_text || "{}";
    console.log("[SemanticRouter] Raw response:", responseText.substring(0, 500));

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

    const result: RouterResult = {
      intent,
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      needsCodeContext: Boolean(parsed.needsCodeContext),
      contextHints: Array.isArray(parsed.contextHints) ? parsed.contextHints : [],
      searchQuery: parsed.searchQuery || undefined,
      imagePrompt: parsed.imagePrompt || undefined,
      codeInstruction: parsed.codeInstruction || undefined,
      clarifyQuestion: parsed.clarifyQuestion || undefined,
      chatResponse: parsed.chatResponse || undefined,
      reasoning: parsed.reasoning || "Ingen förklaring",
    };

    // Compact one-liner log (detailed log is in Orchestrator)
    console.log(
      `[SemanticRouter] → ${result.intent} (${Math.round(result.confidence * 100)}%)` +
      (result.needsCodeContext ? ` [needs context: ${result.contextHints.join(", ")}]` : "")
    );

    return result;
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
  if (lower.includes("http") || lower.includes("www.") || lower.includes(".com")) {
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

