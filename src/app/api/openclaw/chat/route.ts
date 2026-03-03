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

    const messages: ChatMessage[] = [];

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
