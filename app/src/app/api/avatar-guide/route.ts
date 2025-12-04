import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Allow 30 seconds for response
export const maxDuration = 30;

const openai = new OpenAI();

// Model configuration - fast and cost-efficient
const MODEL = "gpt-4o-mini";

// System prompt for the avatar guide
const AVATAR_SYSTEM_PROMPT = `Du är en vänlig och kunnig 3D-avatar guide för Sajtmaskin - en AI-driven webbplatsbyggare på svenska.

DIN PERSONLIGHET:
- Positiv och uppmuntrande, men ärlig med konstruktiv feedback
- Använder casual svenska ("du" inte "ni", "kul" inte "trevligt")
- Kort och koncist - max 2-3 meningar per svar
- Ibland lite humor och emoji (men inte överdrivet)
- Ger KONKRETA, handlingsbara tips

VAD SAJTMASKIN GÖR:
- Låter användare bygga webbsidor med AI
- Har mallar i olika kategorier (landing pages, dashboards, web apps)
- Kan analysera befintliga webbplatser (audit)
- Genererar kod via v0 API
- Användare kan förfina designs med chat

SEKTIONER PÅ SIDAN:
- home: Startsidan med mallar och prompt-input
- builder: Där användaren bygger/förfinar sin sajt
- templates: Mallgalleri
- audit: Webbplatsanalys
- projects: Sparade projekt

ANIMATIONSTRIGGERS (välj EN):
- IDLE: Standard väntläge (neutral)
- TALK_PASSION: Vid viktigt tips eller entusiasm
- TALK_HANDS: Vid förklaring av något
- TALK_LEFT: Vid att peka ut något specifikt
- CONFIDENT: Vid positiv feedback ("Bra jobbat!")
- THINKING: När du funderar/analyserar
- URGENT: Vid varning eller viktigt påpekande
- WALK: Vid transition/navigation tips

SVARA ALLTID i exakt detta format:
[ANIMATION: <ANIMATION_NAMN>]
<din text här>

Exempel:
[ANIMATION: TALK_PASSION]
Coolt att du vill bygga en landing page! 🚀 Testa börja med en mall så får du en bra grund att jobba från.`;

// Proactive tips based on section
const PROACTIVE_TIPS: Record<string, string> = {
  home: `Ge ett välkomnande tips om hur man kommer igång. Föreslå att välja en mall eller skriva en prompt.`,
  builder: `Ge ett kort tips om hur man förfinar sin design. Nämn att man kan chatta för att ändra saker.`,
  templates: `Kommentera mallgalleriet. Ge tips om vilken typ av mall som passar olika behov.`,
  audit: `Förklara kort vad audit-funktionen gör och hur den kan hjälpa.`,
  projects: `Nämn att användaren kan se och fortsätta på sina sparade projekt här.`,
};

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  message: string;
  currentSection: string;
  lastAction: string;
  conversationHistory: ConversationMessage[];
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const { message, currentSection, lastAction, conversationHistory } = body;

    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { message: "API-nyckel saknas", animation: "IDLE" },
        { status: 500 }
      );
    }

    // Build context message
    let userContext = "";

    if (message === "[PROACTIVE_TIP]") {
      // Proactive tip request
      userContext = `Användaren är på: ${currentSection}
${lastAction ? `Senaste handling: ${lastAction}` : ""}

${PROACTIVE_TIPS[currentSection] || PROACTIVE_TIPS.home}`;
    } else {
      // Regular user message
      userContext = `Användaren är på: ${currentSection}
${lastAction ? `Senaste handling: ${lastAction}` : ""}

Användarens fråga: ${message}`;
    }

    // Build conversation context as string
    let conversationContext = "";

    // Add conversation history (last 6 messages max)
    const recentHistory = conversationHistory.slice(-6);
    if (recentHistory.length > 0) {
      conversationContext = "Tidigare konversation:\n";
      for (const msg of recentHistory) {
        conversationContext += `${
          msg.role === "user" ? "Användare" : "Guide"
        }: ${msg.content}\n`;
      }
      conversationContext += "\n";
    }

    // Combine history with current context
    const fullInput = conversationContext + userContext;

    // Call OpenAI Responses API
    const response = await openai.responses.create({
      model: MODEL,
      instructions: AVATAR_SYSTEM_PROMPT,
      input: fullInput,
      max_output_tokens: 300,
    });

    // Extract text from response
    const outputText =
      response.output_text ||
      (
        response as unknown as {
          output?: Array<{ content?: Array<{ text?: string }> }>;
        }
      ).output?.[0]?.content?.[0]?.text ||
      "";

    // Parse animation trigger from response
    const animationMatch = outputText.match(/\[ANIMATION:\s*(\w+)\]/);
    const animation = animationMatch?.[1] || "IDLE";
    const cleanMessage = outputText
      .replace(/\[ANIMATION:\s*\w+\]\s*/g, "")
      .trim();

    return NextResponse.json({
      message:
        cleanMessage || "Hmm, jag förstod inte riktigt. Kan du formulera om?",
      animation: animation,
    });
  } catch (error) {
    console.error("[Avatar Guide] Error:", error);

    return NextResponse.json(
      {
        message: "Oj, något gick snett! Försök igen. 🙏",
        animation: "IDLE",
      },
      { status: 500 }
    );
  }
}
