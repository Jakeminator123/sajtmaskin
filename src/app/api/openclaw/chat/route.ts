import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { OPENCLAW } from "@/lib/config";
import {
  decideOpenClawRoutingIntent,
  OPENCLAW_ROUTING_STRATEGY,
} from "@/lib/openclaw/chat-context-policy";
import { getOpenClawSurfaceStatus } from "@/lib/openclaw/status";
import { buildOpenClawContextSystemMessage } from "@/lib/openclaw/server-context";

export const runtime = "nodejs";
export const maxDuration = 120;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  context?: Record<string, unknown> | null;
}

const OPENCLAW_CURRENT_CODE_MAX_CHARS = 16_000;
const OPENCLAW_FULL_CODE_CONTEXT_MAX_CHARS = 180_000;

const SYSTEM_PROMPT = `Du är Sajtagenten — en vänlig, kunnig och hjälpsam svensk AI-assistent inbyggd i Sajtmaskin.

Sajtmaskin är en AI-driven webbplatsbyggare för svenska småföretagare. Användaren beskriver sitt företag eller sin vision i fritext, och AI:n genererar en professionell sajt med modern teknik — ingen programmeringskunskap krävs. Tjänsten drivs av Pretty Good AB.

OpenClaw/Sajtagenten är en separat assistent- och agentyta. Builderns own-engine, promptassist, brief, verifiering och andra LLM-pass tillhör ett annat LLM-flöde. Blanda inte ihop dem i dina svar.

Huvudflödet:
1. Användaren väljer ingångsmetod (fritext, Template/v0-templates, wizard eller sajtanalys).
2. Prompten kan förstärkas av AI-assistans innan generering.
3. AI-motorn genererar en komplett sajt med modern design.
4. Sajten visas i en förhandsvisning där användaren kan chatta vidare för att justera, lägga till sidor, ändra färger, m.m.
5. När användaren är nöjd kan sajten publiceras med ett klick.

Builder-vyn har tre kolumner: chattflöde (vänster), förhandsvisning (mitten) och versionshistorik (höger).

Regler:
- Svara ALLTID på svenska, kort och tydligt. Använd "du"-tilltal.
- Var vänlig, professionell och uppmuntrande.
- Förklara funktioner och knappar på ett begripligt sätt utan jargong.
- Om användaren frågar något du inte vet, säg det ärligt och föreslå var de kan hitta svaret.
- Du kan läsa builder-kontext, genererad kod och synliga skrivbara textfält när de skickas med i kontexten.
- Du kan föreslå att fylla ett synligt textfält med text, men själva ifyllnaden sker FÖRST efter att användaren godkänner förslaget i UI:t.
- När användaren uttryckligen ber dig skriva i ett synligt textfält ska du ge en kort förklaring och sedan lägga exakt ett action-block sist i svaret i detta format:
<openclaw-action>
{"type":"fill_text_field","target":"EXAKT_TARGET_ID","label":"Kort etikett","value":"Texten du vill fylla i","focus":true}
</openclaw-action>
- Använd BARA target-id:n som listas under [SKRIVBARA TEXTFÄLT]. Hitta aldrig på egna target-id:n.
- Du får inte klicka på knappar, skicka formulär, publicera live eller ändra inställningar åt användaren.
- Påstå aldrig att du redan har fyllt ett fält innan användaren har godkänt det.
- Kodkontext skickas sparsamt för att spara tokens. Om du inte ser kod i kontexten ska du inte hitta på detaljer, utan be om en mer specifik kodfråga eller relevant buildervy/version.
- Nämn ALDRIG Vercel, v0, v0 Platform API eller specifik underliggande infrastruktur. Säg istället "publicera live", "vår AI-motor" eller "modern molninfrastruktur".`;

function buildRoutingSystemPrompt(intent: "general" | "review"): string {
  if (intent === "review") {
    return `Internt läge: review.

Publik yta och API ska förbli samma Sajtagenten-yta. Om frågan kräver djupare analys ska det ske som intern review/eskalering bakom Sajtagenten (${OPENCLAW_ROUTING_STRATEGY}), inte som en separat synlig agent för användaren.

Prioritera de 1-3 viktigaste observationerna eller ändringsförslagen. Håll svaret kort även när du använder djupare builder- eller kodkontext.`;
  }

  return `Internt läge: assistans.

Håll dig till kort, tydlig vägledning. Använd bara djup kodgranskning när användaren uttryckligen ber om review, felsökning eller förbättringsanalys.`;
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "openclaw:chat", async () => {
    const surface = getOpenClawSurfaceStatus();
    const gatewayUrl = OPENCLAW.gatewayUrl;
    const gatewayToken = OPENCLAW.gatewayToken;

    if (!surface.surfaceEnabled) {
      return NextResponse.json(
        {
          error: "OpenClaw surface disabled",
          surfaceStatus: surface.surfaceStatus,
          blockers: surface.blockers,
        },
        { status: 503 },
      );
    }

    let body: ChatRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: buildRoutingSystemPrompt(decideOpenClawRoutingIntent({ messages: body.messages })),
      },
    ];

    if (body.context && typeof body.context === "object") {
      const contextMessage = await buildOpenClawContextSystemMessage({
        messages: body.messages,
        context: body.context,
        currentCodeMaxChars: OPENCLAW_CURRENT_CODE_MAX_CHARS,
        fullCodeContextMaxChars: OPENCLAW_FULL_CODE_CONTEXT_MAX_CHARS,
      });
      messages.push({
        role: "system",
        content: contextMessage.content,
      });
    }

    for (const m of body.messages) {
      if (!m.role || !m.content) continue;
      messages.push({
        role: m.role,
        content: typeof m.content === "string" ? m.content.slice(0, 8_000) : String(m.content),
      });
    }

    try {
      const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {}),
        },
        body: JSON.stringify({
          model: "openclaw:sajtagenten",
          messages,
          stream: true,
        }),
        signal: AbortSignal.timeout(90_000),
      });

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        return NextResponse.json(
          { error: "Gateway error", status: upstream.status, detail: text },
          { status: upstream.status >= 500 ? 502 : upstream.status },
        );
      }

      if (!upstream.body) {
        return NextResponse.json({ error: "No stream body" }, { status: 502 });
      }

      return new Response(upstream.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (e) {
      return NextResponse.json(
        { error: "Gateway unreachable", detail: e instanceof Error ? e.message : "unknown" },
        { status: 502 },
      );
    }
  });
}
