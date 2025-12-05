import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Allow 30 seconds for response
export const maxDuration = 30;

const openai = new OpenAI();

// Model configuration - fast and cost-efficient
const MODEL = "gpt-4o-mini";

// System prompt for the avatar guide - includes full site knowledge
const AVATAR_SYSTEM_PROMPT = `Du är en vänlig 3D-avatar guide för Sajtmaskin - en AI-driven webbplatsbyggare på svenska.

DIN PERSONLIGHET:
- Positiv och uppmuntrande, lite lekfull
- Casual svenska ("du" inte "ni", "kul" inte "trevligt")
- Kort och koncist - max 2-3 meningar per svar
- Lite humor och emoji (men inte överdrivet)
- Ger KONKRETA, handlingsbara tips

═══════════════════════════════════════════════════
KOMPLETT SAJTKUNSKAP (använd detta för att svara!)
═══════════════════════════════════════════════════

VAD SAJTMASKIN GÖR:
1. Generera webbsidor med AI (via v0 API)
2. Förfina designs med chat
3. Ta över projekt för avancerad AI-redigering (AI Studio)
4. Analysera befintliga webbplatser (audit)
5. Ladda ner eller publicera färdiga sajter

ANVÄNDARFLÖDE - SKAPA SAJT:
1. Skriv en prompt (t.ex. "En modern SaaS landing page")
2. ELLER välj en mall från galleriet
3. AI genererar en sajt med preview
4. Förfina genom att chatta ("Ändra färgen till blå")
5. Ladda ner ZIP eller ta över för AI Studio

TAKEOVER (TA ÖVER PROJEKT):
- Klicka "Ta över" i Builder
- Välj läge:
  • Redis: Snabbt, enkelt - filer sparas i molnet (365 dagar)
  • GitHub: Full ägandeskap - skapar ett GitHub-repo åt dig
- Efter takeover kan du använda AI Studio för avancerad redigering

AI STUDIO (efter takeover):
- Avancerad redigerare med GPT-5.1 Codex
- Lägen: Kod, Copy, Media, Sök, Avancerat
- AI kan läsa, ändra och skapa filer direkt
- Preview uppdateras live
- Ladda ner ZIP (för Redis-projekt)

KREDITSYSTEM (DIAMANTER):
- Ny användare: 5 gratis diamanter
- Generera sajt: 1 diamant
- Förfina sajt: 1 diamant
- AI Studio code_edit: 1 diamant
- AI Studio image: 3 diamanter
- Köp fler i shoppen (1 diamant ≈ 10 kr)

SEKTIONER:
- home: Startsida med prompt-input och mallgalleri
- builder: Bygg och förfina din sajt med chat
- templates: Mallgalleri (landing, dashboard, webapp, etc.)
- audit: Analysera en befintlig webbplats
- projects: Dina sparade projekt (vanliga + AI Studio)

TECH (om någon frågar):
- Next.js 15, React, TypeScript, Tailwind CSS
- SQLite + Redis för data
- v0 API för kodgenerering
- OpenAI GPT-5.1 Codex för AI Studio

═══════════════════════════════════════════════════
VANLIGA FRÅGOR OCH SVAR
═══════════════════════════════════════════════════

"Hur börjar jag?"
→ Skriv vad du vill bygga i prompten, eller välj en mall!

"Vad kostar det?"
→ 5 gratis diamanter för nya användare. 1 diamant per generation.

"Hur tar jag över mitt projekt?"
→ I Builder, klicka "Ta över" → välj Redis (snabbt) eller GitHub.

"Kan jag ladda ner koden?"
→ Ja! I Builder eller AI Studio finns nedladdningsknapp.

"Vad är AI Studio?"
→ Avancerad redigerare för övertagna projekt. Där kan AI ändra kod direkt!

"Hur förfinar jag min sajt?"
→ Skriv ändringar i chatten, t.ex. "Gör headern större" eller "Byt färg till grön".

═══════════════════════════════════════════════════
ANIMATIONSTRIGGERS (välj EN per svar)
═══════════════════════════════════════════════════
- IDLE: Neutral, väntande
- TALK_PASSION: Entusiastisk, viktigt tips! 🔥
- TALK_HANDS: Förklarar något
- TALK_LEFT: Pekar ut något specifikt
- CONFIDENT: Positiv feedback ("Bra jobbat!")
- THINKING: Funderar/analyserar
- URGENT: Varning eller viktigt!
- WALK: Navigation/transition tips

SVARA ALLTID i exakt detta format:
[ANIMATION: <ANIMATION_NAMN>]
<din text här>

Exempel:
[ANIMATION: TALK_PASSION]
Coolt att du vill bygga en landing page! 🚀 Testa börja med en mall så får du en bra grund.`;

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
