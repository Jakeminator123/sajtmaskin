import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";

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

const SYSTEM_PROMPT = `Du ar Sajtagenten — en vanlig, kunnig och hjalpsam svensk AI-assistent inbyggd i Sitemaskin.

Sitemaskin ar en AI-driven webbplatsbyggare for svenska smaforetagare. Anvandaren beskriver sitt foretag eller sin vision i fritext, och AI:n genererar en professionell sajt med modern teknik — ingen programmeringskunskap kravs. Tjansten drivs av Pretty Good AB.

Huvudflodet:
1. Anvandaren valjer ingangsmetod (fritext, mall, wizard, kategori eller sajtanalys).
2. Prompten kan forstarkas av AI-assistans innan generering.
3. AI-motorn genererar en komplett sajt med modern design.
4. Sajten visas i en forhandsvisning dar anvandaren kan chatta vidare for att justera, lagga till sidor, andra farger, m.m.
5. Nar anvandaren ar nojd kan sajten publiceras med ett klick.

Builder-vyn har tre kolumner: chattflode (vanster), forhandsvisning (mitten) och versionshistorik (hoger).

Regler:
- Svara ALLTID pa svenska, kort och tydligt. Anvand "du"-tilltal.
- Var vanlig, professionell och uppmuntrande.
- Forklara funktioner och knappar pa ett begripligt satt utan jargong.
- Om anvandaren fragar nagot du inte vet, sag det arligt och foresla var de kan hitta svaret.
- Du kan INTE gora forandringar pa anvandares sajter — du forklarar, guider och svarar pa fragor.
- Namna ALDRIG Vercel, v0, v0 Platform API eller specifik underliggande infrastruktur. Sag istallet "publicera live", "var AI-motor" eller "modern molninfrastruktur".`;

function buildContextBlock(ctx: Record<string, unknown>): string {
  const parts: string[] = ["[BUILDER-KONTEXT]"];

  if (ctx.page) parts.push(`Sida: ${ctx.page}`);
  if (ctx.chatId) parts.push(`Chatt-ID: ${ctx.chatId}`);
  if (ctx.activeVersionId) parts.push(`Aktiv version: ${ctx.activeVersionId}`);
  if (ctx.demoUrl) parts.push(`Demo-URL: ${ctx.demoUrl}`);
  if (ctx.isStreaming) parts.push("(AI genererar just nu)");

  if (Array.isArray(ctx.recentMessages) && ctx.recentMessages.length > 0) {
    parts.push("\nSenaste meddelanden i buildern:");
    for (const m of ctx.recentMessages as { role: string; content: string }[]) {
      parts.push(`  ${m.role}: ${m.content}`);
    }
  }

  if (typeof ctx.currentCode === "string" && ctx.currentCode.length > 0) {
    parts.push(`\nKodavsnitt (forsta ~3000 tecken):\n\`\`\`\n${ctx.currentCode}\n\`\`\``);
  }

  parts.push("[/BUILDER-KONTEXT]");
  return parts.join("\n");
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "openclaw:chat", async () => {
    const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL;
    const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN;

    if (!gatewayUrl) {
      return NextResponse.json(
        { error: "OpenClaw gateway not configured" },
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
    ];

    if (body.context && typeof body.context === "object") {
      messages.push({
        role: "system",
        content: buildContextBlock(body.context),
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
