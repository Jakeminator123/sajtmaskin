import { NextRequest, NextResponse } from "next/server";
import { OPENCLAW } from "@/lib/config";
import { prepareCredits } from "@/lib/credits/server";
import { withRateLimit } from "@/lib/rateLimit";
import { resolveFileContext } from "@/lib/openclaw/resolve-file-context";

export const runtime = "nodejs";
export const maxDuration = 60;

interface TipsRequestBody {
  context?: Record<string, unknown> | null;
}

const TIPS_SYSTEM_PROMPT = `Du är Sajtagenten i Sajtmaskin. Du ger KORTA, konkreta och handlingsbara tips i buildern.

Regler:
- Svara alltid på svenska.
- Ge 1-2 korta tips (max 2).
- Varje tips ska vara max ~180 tecken och börja med ett verb.
- Håll fokus på nästa praktiska steg i buildern (innehåll, struktur, CTA, UX, tydlighet).
- Upprepa inte hela chatten. Summera inte lång text.
- Nämn aldrig intern infrastruktur eller leverantörer.
- Om kontext saknas: ge ett generellt men användbart byggtips i 1 punkt.

Svara ENBART med tipstext (inga rubriker, ingen inledning).`;

function normalizeText(value: unknown, max = 600): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function buildTipsContextBlock(ctx: Record<string, unknown>): string {
  const parts: string[] = ["[BUILDER-TIPS-KONTEXT]"];

  const page = normalizeText(ctx.page, 80);
  const chatId = normalizeText(ctx.chatId, 120);
  const activeVersionId = normalizeText(ctx.activeVersionId, 120);
  const demoUrl = normalizeText(ctx.demoUrl, 280);
  const projectId = normalizeText(ctx.projectId, 120);
  const latestAssistantMessage = normalizeText(ctx.latestAssistantMessage, 800);
  const latestUserMessage = normalizeText(ctx.latestUserMessage, 500);

  if (page) parts.push(`Sida: ${page}`);
  if (projectId) parts.push(`Projekt-ID: ${projectId}`);
  if (chatId) parts.push(`Chatt-ID: ${chatId}`);
  if (activeVersionId) parts.push(`Aktiv version: ${activeVersionId}`);
  if (demoUrl) parts.push(`Demo-URL: ${demoUrl}`);

  if (latestUserMessage) {
    parts.push(`\nSenaste användarmeddelande:\n${latestUserMessage}`);
  }

  if (latestAssistantMessage) {
    parts.push(`\nSenaste AI-svar i buildern:\n${latestAssistantMessage}`);
  }

  if (Array.isArray(ctx.recentMessages) && ctx.recentMessages.length > 0) {
    parts.push("\nKort historik:");
    const recent = ctx.recentMessages
      .slice(-4)
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const role = normalizeText((item as { role?: unknown }).role, 20);
        const content = normalizeText((item as { content?: unknown }).content, 200);
        if (!role || !content) return null;
        return `- ${role}: ${content}`;
      })
      .filter((line): line is string => Boolean(line));
    parts.push(...recent);
  }

  if (typeof ctx._fileManifest === "string" && ctx._fileManifest.length > 0) {
    parts.push(`\n[FILMANIFEST]\n${ctx._fileManifest}\n[/FILMANIFEST]`);
  } else {
    const currentCode = normalizeText(ctx.currentCode, 2200);
    if (currentCode) {
      parts.push(`\nKodavsnitt:\n\`\`\`\n${currentCode}\n\`\`\``);
    }
  }

  parts.push("[/BUILDER-TIPS-KONTEXT]");
  return parts.join("\n");
}

function extractAssistantText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";

  const first = choices[0] as { message?: { content?: unknown } };
  const content = first?.message?.content;

  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const text = content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!part || typeof part !== "object") return "";
      const maybeText = (part as { text?: unknown }).text;
      return typeof maybeText === "string" ? maybeText : "";
    })
    .join("")
    .trim();

  return text;
}

export async function POST(req: NextRequest) {
  return withRateLimit(req, "openclaw:tips", async () => {
    const gatewayUrl = OPENCLAW.gatewayUrl;
    const gatewayToken = OPENCLAW.gatewayToken;

    if (!gatewayUrl) {
      return NextResponse.json({ success: false, error: "OpenClaw gateway not configured" }, { status: 503 });
    }

    const creditCheck = await prepareCredits(req, "openclaw.tip");
    if (!creditCheck.ok) return creditCheck.response;

    let body: TipsRequestBody;
    try {
      body = (await req.json()) as TipsRequestBody;
    } catch {
      return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const context: Record<string, unknown> =
      body.context && typeof body.context === "object"
        ? { ...body.context }
        : {};

    const tipChatId = typeof context.chatId === "string" ? context.chatId : "";
    const tipVersionId =
      typeof context.activeVersionId === "string" ? context.activeVersionId : "";
    if (tipChatId && !context._fileManifest) {
      const fc = await resolveFileContext(tipChatId, tipVersionId || null);
      if (fc) {
        context._fileManifest = fc.manifest;
      }
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
          stream: false,
          temperature: 0.4,
          messages: [
            { role: "system", content: TIPS_SYSTEM_PROMPT },
            { role: "system", content: buildTipsContextBlock(context) },
            { role: "user", content: "Ge 1-2 korta builder-tips nu." },
          ],
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!upstream.ok) {
        const detail = await upstream.text().catch(() => "");
        return NextResponse.json(
          { success: false, error: "Gateway error", status: upstream.status, detail },
          { status: upstream.status >= 500 ? 502 : upstream.status },
        );
      }

      const payload = (await upstream.json().catch(() => null)) as unknown;
      const tipText = extractAssistantText(payload).slice(0, 700);
      if (!tipText) {
        return NextResponse.json(
          { success: false, error: "Tomt svar från tipsgeneratorn" },
          { status: 502 },
        );
      }

      await creditCheck.commit();
      return NextResponse.json({
        success: true,
        tip: tipText,
        cost: creditCheck.cost,
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
