import { NextRequest, NextResponse } from "next/server";
import { OPENCLAW } from "@/lib/config";
import { withRateLimit } from "@/lib/rateLimit";
import {
  decideOpenClawRoutingIntent,
  OPENCLAW_ROUTING_STRATEGY,
  type OpenClawChatMessageLike,
} from "@/lib/openclaw/chat-context-policy";
import { buildOpenClawContextSystemMessage } from "@/lib/openclaw/server-context";
import { getOpenClawSurfaceStatus } from "@/lib/openclaw/status";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRole = "user" | "assistant";

interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface DidChatRequestBody {
  sessionId?: string;
  message?: string;
  text?: string;
  input?: string;
  context?: Record<string, unknown> | null;
  recentMessages?: Array<{
    role?: unknown;
    content?: unknown;
  }>;
}

const MAX_SESSION_ID_CHARS = 120;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_HISTORY_MESSAGES = 8;
const MAX_HISTORY_MESSAGE_CHARS = 800;

const DID_BRIDGE_SYSTEM_PROMPT = `Du är Sajtagenten som hjärna bakom en svensk D-ID-avatar i Sajtmaskin.

OpenClaw/Sajtagenten är en separat assistent- och agentyta. Builderns own-engine, promptassist, brief, verifiering och andra LLM-pass är andra LLM-flöden. Blanda inte ihop dem när du förklarar vad som händer.

Regler:
- Svara alltid på svenska.
- Svara kort, naturligt och pratbart. Tänk talspråk, inte chattroman.
- Håll dig normalt till 1-3 korta meningar.
- Använd inte markdown, kodblock, listor eller länkar.
- Om något är osäkert: säg det kort och tydligt.
- Om OpenClaw- eller systemspecifik infrastruktur är irrelevant för användaren: nämn den inte.
- Om användaren ber om något som kräver webbplatsändring eller builder-ändring: säg kort vad som bör ändras, men låtsas inte att du redan gjort det.`;

function buildRoutingSystemPrompt(intent: "general" | "review"): string {
  if (intent === "review") {
    return `Internt läge: review.

Den publika ytan ska fortfarande vara Sajtagenten/avataren. Om djupare analys behövs ska den ske som intern review bakom Sajtagenten (${OPENCLAW_ROUTING_STRATEGY}), inte via en separat synlig agent.

Använd djupare builder- eller kodkontext bara när den finns och verkligen behövs. Leverera sedan ett kort, pratbart svar med de viktigaste slutsatserna.`;
  }

  return `Internt läge: assistans.

Håll dig till kort, naturlig vägledning. Läs inte in mer kod- eller filkontext än frågan motiverar.`;
}

function sanitizeText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function extractUserMessage(body: DidChatRequestBody): string {
  return (
    sanitizeText(body.message, MAX_MESSAGE_CHARS) ||
    sanitizeText(body.text, MAX_MESSAGE_CHARS) ||
    sanitizeText(body.input, MAX_MESSAGE_CHARS)
  );
}

function sanitizeSessionId(value: unknown): string {
  return sanitizeText(value, MAX_SESSION_ID_CHARS);
}

function sanitizeHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_HISTORY_MESSAGES)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const role = (item as { role?: unknown }).role;
      const content = sanitizeText((item as { content?: unknown }).content, MAX_HISTORY_MESSAGE_CHARS);
      if ((role !== "user" && role !== "assistant") || !content) return null;
      return {
        role,
        content,
      } as ChatMessage;
    })
    .filter((item): item is ChatMessage => Boolean(item));
}

function extractAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";

  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const maybeText = (part as { text?: unknown }).text;
      return typeof maybeText === "string" ? maybeText : "";
    })
    .join("")
    .trim();
}

async function buildMessages(params: {
  userMessage: string;
  history: ChatMessage[];
  context?: Record<string, unknown> | null;
}) {
  const conversationMessages: OpenClawChatMessageLike[] = [
    ...params.history,
    { role: "user", content: params.userMessage },
  ];
  const routingIntent = decideOpenClawRoutingIntent({
    messages: conversationMessages,
  });
  const messages: Array<{ role: "system" | ChatRole; content: string }> = [
    { role: "system", content: DID_BRIDGE_SYSTEM_PROMPT },
    { role: "system", content: buildRoutingSystemPrompt(routingIntent) },
  ];

  if (params.context && typeof params.context === "object") {
    const contextMessage = await buildOpenClawContextSystemMessage({
      messages: conversationMessages,
      context: params.context,
      currentCodeMaxChars: 12_000,
      fullCodeContextMaxChars: 120_000,
      manifestFileLimit: 14,
      fullFileLimit: 20,
    });
    messages.push({
      role: "system",
      content: contextMessage.content,
    });
  }

  messages.push(...params.history, { role: "user", content: params.userMessage });
  return messages;
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "did:chat", async () => {
    const surface = getOpenClawSurfaceStatus();
    const gatewayUrl = OPENCLAW.gatewayUrl;
    const gatewayToken = OPENCLAW.gatewayToken;

    if (!surface.surfaceEnabled) {
      return NextResponse.json(
        {
          success: false,
          error: "OpenClaw surface disabled",
          surfaceStatus: surface.surfaceStatus,
          blockers: surface.blockers,
        },
        { status: 503 },
      );
    }

    let body: DidChatRequestBody;
    try {
      body = (await req.json()) as DidChatRequestBody;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const userMessage = extractUserMessage(body);
    if (!userMessage) {
      return NextResponse.json(
        { success: false, error: "message, text eller input krävs" },
        { status: 400 },
      );
    }

    const sessionId = sanitizeSessionId(body.sessionId) || `avatar-${crypto.randomUUID()}`;
    const history = sanitizeHistory(body.recentMessages);

    try {
      const messages = await buildMessages({
        userMessage,
        history,
        context: body.context,
      });
      const upstream = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(gatewayToken ? { Authorization: `Bearer ${gatewayToken}` } : {}),
        },
        body: JSON.stringify({
          model: "openclaw:sajtagenten",
          stream: false,
          user: sessionId,
          messages,
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        return NextResponse.json(
          {
            success: false,
            error: "Gateway error",
            status: upstream.status,
            detail,
          },
          { status: upstream.status >= 500 ? 502 : upstream.status },
        );
      }

      const payload = (await upstream.json().catch(() => null)) as unknown;
      const reply = extractAssistantText(payload);
      if (!reply) {
        return NextResponse.json(
          { success: false, error: "Tomt svar från avatar-bridgen" },
          { status: 502 },
        );
      }

      return NextResponse.json({
        success: true,
        sessionId,
        provider: "openclaw-avatar-bridge",
        reply,
        text: reply,
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: "Gateway unreachable",
          detail: error instanceof Error ? error.message : "unknown",
        },
        { status: 502 },
      );
    }
  });
}
