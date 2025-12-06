import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { getProjectFiles, getProjectMeta } from "@/lib/redis";

// Allow up to 90 seconds for AI responses with reasoning
export const maxDuration = 90;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is required");
  }
  return new OpenAI({ apiKey });
}

// Model configuration - use GPT-5 for advanced reasoning, fallback to 4o
const PRIMARY_MODEL = "gpt-5";
const FALLBACK_MODEL = "gpt-4o";

// Tools for reading project files
const PROJECT_TOOLS: OpenAI.Responses.Tool[] = [
  {
    type: "function",
    name: "read_project_file",
    description: "Read the contents of a file from the user's current project",
    strict: true,
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "The file path to read (e.g. 'src/app/page.tsx')",
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_project_files",
    description: "List all files in the user's current project",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "analyze_project_structure",
    description:
      "Analyze the project structure and return a summary of components, pages, and tech stack",
    strict: true,
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

// System prompt for the avatar guide - comprehensive knowledge
const AVATAR_SYSTEM_PROMPT = `Du är en vänlig, kunnig 3D-avatar guide för Sajtmaskin - en AI-driven webbplatsbyggare.

═══════════════════════════════════════════════════
DIN PERSONLIGHET & STIL
═══════════════════════════════════════════════════
- Positiv och uppmuntrande, lite lekfull men professionell
- Casual svenska ("du" inte "ni", "kul" inte "trevligt")
- Kort och koncist - vanligtvis 2-4 meningar
- Lite humor och emoji (men inte överdrivet)
- ALLTID konkreta, handlingsbara tips
- Firar framgångar entusiastiskt! 🎉
- Varnar försiktigt men tydligt vid misstag

═══════════════════════════════════════════════════
DIN KUNSKAP & FÖRMÅGOR
═══════════════════════════════════════════════════

DU HAR TILLGÅNG TILL:
1. Projektfiler - Du kan läsa användarens kodfiler för att ge specifika råd
2. Projektstruktur - Du kan analysera hela projektets uppbyggnad
3. Användarhistorik - Vad de har gjort och var de är

DU KAN:
- Läsa och analysera kod (React, Next.js, TypeScript, Tailwind)
- Ge specifika förbättringsförslag baserat på deras faktiska kod
- Förklara vad som är bra och vad som kan förbättras
- Uppskatta "värdeökning" baserat på vad de bygger
- Ge push-poäng för bra arbete

VAD SAJTMASKIN GÖR:
1. Generera webbsidor med AI (via v0 API)
2. Förfina designs med chat
3. Ta över projekt för avancerad AI-redigering (AI Studio)
4. Analysera befintliga webbplatser (audit)
5. Ladda ner eller publicera färdiga sajter

KREDITSYSTEM (DIAMANTER):
- Ny användare: 5 gratis diamanter
- Generera sajt: 1 diamant
- Förfina sajt: 1 diamant
- AI Studio code_edit: 1 diamant
- AI Studio image: 3 diamanter

═══════════════════════════════════════════════════
VÄRDESYSTEM & POÄNG (använd aktivt!)
═══════════════════════════════════════════════════

Ge "PUSH-POÄNG" för bra handlingar:
- +10 poäng: Första generationen
- +5 poäng: Varje förfining
- +20 poäng: Ta över projekt
- +15 poäng: Ladda ner projekt
- +25 poäng: Implementera en rekommendation
- +5 poäng: Ställa en bra fråga

Uppskatta "VÄRDEÖKNING" (kvalitativt):
- "Din sajt har ökat i kvalitet!" ⭐
- "Den här ändringen gör sajten mer professionell"
- "Bra! Det förbättrar användarupplevelsen"

═══════════════════════════════════════════════════
DYNAMISKA REKOMMENDATIONER
═══════════════════════════════════════════════════

BASERAT PÅ VAD DU SER I KODEN, föreslå:

1. DESIGN-FÖRBÄTTRINGAR:
   - Bättre färgkontrast
   - Konsekvent spacing
   - Responsiv design
   - Typografihierarki

2. KOD-FÖRBÄTTRINGAR:
   - Komponentuppdelning
   - Bättre namngivning
   - Performance-optimeringar
   - Tillgänglighet (a11y)

3. FUNKTIONALITET:
   - Saknade sektioner (footer, CTA, testimonials)
   - Interaktivitet
   - Formulär och kontakt
   - Analytics-spårning

4. SEO & MARKNADSFÖRING:
   - Meta-taggar
   - Open Graph
   - Semantisk HTML
   - Laddningstid

═══════════════════════════════════════════════════
VARNINGAR (var försiktig men tydlig!)
═══════════════════════════════════════════════════

Varna om du ser:
- Hårdkodade API-nycklar eller secrets
- Brutna imports/komponenter
- Accessibility-problem
- Mobilanpassning saknas
- Mycket duplicerad kod
- Saknad felhantering

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
- CELEBRATING: Firar framgång! 🎉
- FUN: Lekfull, rolig kommentar
- WALK: Navigation/transition tips

═══════════════════════════════════════════════════
SVARSFORMAT (följ alltid!)
═══════════════════════════════════════════════════

[ANIMATION: <ANIMATION_NAMN>]
[POINTS: +X poäng för <anledning>] (valfritt, när lämpligt)
[VALUE: <värdeökning-kommentar>] (valfritt, när lämpligt)
<din text här>

Exempel på bra svar:
[ANIMATION: CELEBRATING]
[POINTS: +20 poäng för att ta över projektet!]
[VALUE: Nu kan du göra avancerade AI-ändringar direkt i koden!]
Wow, grattis! 🎉 Du har just låst upp AI Studio! Här kan du be mig göra precisa ändringar i din kod.

Exempel på varning:
[ANIMATION: URGENT]
Obs! Jag ser att du har en API-nyckel synlig i koden. 🔐 Det är viktigt att flytta den till en .env-fil för säkerheten!`;

// Proactive tips based on section and context
const getProactiveTip = (section: string, hasProject: boolean): string => {
  if (hasProject) {
    return `Användaren har ett aktivt projekt. Analysera det och ge specifika förbättringsförslag baserat på koden.`;
  }

  const tips: Record<string, string> = {
    home: `Ge ett välkomnande tips om hur man kommer igång. Föreslå att välja en mall eller skriva en prompt. Ge +5 poäng för första besöket!`,
    builder: `Ge ett kort tips om hur man förfinar sin design. Titta på projektet om möjligt och ge specifika förslag.`,
    templates: `Kommentera mallgalleriet. Föreslå vilken typ av mall som passar olika behov.`,
    audit: `Förklara kort vad audit-funktionen gör. Uppmuntra att analysera sin nuvarande sajt!`,
    projects: `Nämn att användaren kan se och fortsätta på sina sparade projekt. Ge +5 poäng för att organisera sina projekt!`,
  };

  return tips[section] || tips.home;
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
  projectId?: string; // Current project ID if any
  previousResponseId?: string; // For conversation continuity
}

// Execute tool calls for reading project files
async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  projectId: string | undefined
): Promise<string> {
  console.log(`[Avatar Guide] Executing tool: ${toolName}`, {
    args,
    projectId,
  });

  if (!projectId) {
    return "Inget aktivt projekt. Användaren måste först skapa eller ta över ett projekt.";
  }

  switch (toolName) {
    case "read_project_file": {
      const path = args.path as string;
      const files = await getProjectFiles(projectId);
      if (!files) {
        return `Projektet hittades inte: ${projectId}`;
      }
      const file = files.find((f) => f.path === path);
      if (!file) {
        return `Filen hittades inte: ${path}`;
      }
      return file.content;
    }

    case "list_project_files": {
      const files = await getProjectFiles(projectId);
      if (!files) {
        return "Projektet hittades inte.";
      }
      return files.map((f) => f.path).join("\n");
    }

    case "analyze_project_structure": {
      const files = await getProjectFiles(projectId);
      const meta = await getProjectMeta(projectId);
      if (!files) {
        return "Projektet hittades inte.";
      }

      // Analyze structure
      const analysis = {
        totalFiles: files.length,
        fileTypes: {} as Record<string, number>,
        hasPackageJson: false,
        hasTailwind: false,
        hasTypeScript: false,
        components: [] as string[],
        pages: [] as string[],
        projectName: meta?.name || "Okänt projekt",
        takenOverAt: meta?.takenOverAt || "Okänt",
      };

      for (const file of files) {
        const ext = file.path.split(".").pop() || "other";
        analysis.fileTypes[ext] = (analysis.fileTypes[ext] || 0) + 1;

        if (file.path === "package.json") {
          analysis.hasPackageJson = true;
          if (file.content.includes("tailwind")) {
            analysis.hasTailwind = true;
          }
        }

        if (file.path.endsWith(".tsx") || file.path.endsWith(".ts")) {
          analysis.hasTypeScript = true;
        }

        if (file.path.includes("/components/")) {
          analysis.components.push(file.path);
        }

        if (
          file.path.includes("/app/") &&
          (file.path.endsWith("page.tsx") || file.path.endsWith("page.jsx"))
        ) {
          analysis.pages.push(file.path);
        }
      }

      return JSON.stringify(analysis, null, 2);
    }

    default:
      return `Okänt verktyg: ${toolName}`;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: RequestBody = await req.json();
    const {
      message,
      currentSection,
      lastAction,
      conversationHistory,
      projectId,
      previousResponseId,
    } = body;

    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { message: "API-nyckel saknas", animation: "IDLE" },
        { status: 500 }
      );
    }

    const hasProject = !!projectId;

    // Build context message
    let userContext = "";

    if (message === "[PROACTIVE_TIP]") {
      userContext = `Användaren är på: ${currentSection}
${lastAction ? `Senaste handling: ${lastAction}` : ""}
${hasProject ? `Aktivt projekt: ${projectId}` : "Inget aktivt projekt"}

${getProactiveTip(currentSection, hasProject)}

${
  hasProject
    ? "Använd verktygen för att analysera projektet och ge specifika tips!"
    : ""
}`;
    } else {
      userContext = `Användaren är på: ${currentSection}
${lastAction ? `Senaste handling: ${lastAction}` : ""}
${hasProject ? `Aktivt projekt: ${projectId}` : "Inget aktivt projekt"}

Användarens meddelande: ${message}

${
  hasProject
    ? "Du kan använda verktygen för att läsa projektet och ge specifika svar!"
    : ""
}`;
    }

    // Build conversation context
    let conversationContext = "";
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

    const fullInput = conversationContext + userContext;

    // Determine if we need tools (only for project context)
    const tools = hasProject ? PROJECT_TOOLS : [];

    let usedModel = PRIMARY_MODEL;

    // Try primary model, fall back if needed
    let response: OpenAI.Responses.Response;
    try {
      console.log(`[Avatar Guide] Trying ${PRIMARY_MODEL}...`);
      response = await getOpenAIClient().responses.create({
        model: PRIMARY_MODEL,
        instructions: AVATAR_SYSTEM_PROMPT,
        input: fullInput,
        tools,
        max_output_tokens: 500,
        store: true,
        ...(previousResponseId && { previous_response_id: previousResponseId }),
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "";
      if (errorMsg.includes("model") || errorMsg.includes("not found")) {
        console.log(
          `[Avatar Guide] ${PRIMARY_MODEL} not available, falling back to ${FALLBACK_MODEL}`
        );
        usedModel = FALLBACK_MODEL;
        response = await getOpenAIClient().responses.create({
          model: FALLBACK_MODEL,
          instructions: AVATAR_SYSTEM_PROMPT,
          input: fullInput,
          tools,
          max_output_tokens: 500,
          store: true,
          ...(previousResponseId && {
            previous_response_id: previousResponseId,
          }),
        });
      } else {
        throw error;
      }
    }

    // Process tool calls if any
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const functionCalls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
          item.type === "function_call"
      );

      if (functionCalls.length === 0) break;

      console.log(
        `[Avatar Guide] Processing ${functionCalls.length} tool calls`
      );

      const functionResults: OpenAI.Responses.ResponseInputItem[] = [];

      for (const call of functionCalls) {
        try {
          const args = JSON.parse(call.arguments);
          const result = await executeToolCall(call.name, args, projectId);
          functionResults.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: result,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Okänt fel";
          functionResults.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: `Fel: ${errorMessage}`,
          });
        }
      }

      // Continue conversation with tool results
      response = await getOpenAIClient().responses.create({
        model: usedModel,
        input: functionResults,
        previous_response_id: response.id,
        tools,
        max_output_tokens: 500,
        store: true,
      });
    }

    // Extract text from response
    const outputText =
      response.output_text ||
      response.output
        .filter(
          (item): item is OpenAI.Responses.ResponseOutputMessage =>
            item.type === "message"
        )
        .flatMap((msg) =>
          msg.content
            .filter(
              (c): c is OpenAI.Responses.ResponseOutputText =>
                c.type === "output_text"
            )
            .map((c) => c.text)
        )
        .join("\n") ||
      "";

    // Parse animation trigger
    const animationMatch = outputText.match(/\[ANIMATION:\s*(\w+)\]/);
    const animation = animationMatch?.[1] || "IDLE";

    // Parse points
    const pointsMatch = outputText.match(/\[POINTS:\s*\+?(\d+)[^\]]*\]/);
    const points = pointsMatch ? parseInt(pointsMatch[1], 10) : 0;

    // Parse value message
    const valueMatch = outputText.match(/\[VALUE:\s*([^\]]+)\]/);
    const valueMessage = valueMatch?.[1] || null;

    // Clean the message
    const cleanMessage = outputText
      .replace(/\[ANIMATION:\s*\w+\]\s*/g, "")
      .replace(/\[POINTS:\s*[^\]]+\]\s*/g, "")
      .replace(/\[VALUE:\s*[^\]]+\]\s*/g, "")
      .trim();

    console.log(`[Avatar Guide] Response:`, {
      model: usedModel,
      animation,
      points,
      valueMessage,
      messageLength: cleanMessage.length,
    });

    return NextResponse.json({
      message:
        cleanMessage || "Hmm, jag förstod inte riktigt. Kan du formulera om?",
      animation,
      points,
      valueMessage,
      responseId: response.id, // For conversation continuity
      model: usedModel,
    });
  } catch (error) {
    console.error("[Avatar Guide] Error:", error);

    return NextResponse.json(
      {
        message: "Oj, något gick snett! Försök igen. 🙏",
        animation: "IDLE",
        points: 0,
        valueMessage: null,
      },
      { status: 500 }
    );
  }
}
