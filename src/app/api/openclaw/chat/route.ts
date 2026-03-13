import { NextRequest, NextResponse } from "next/server";
import { withRateLimit } from "@/lib/rateLimit";
import { OPENCLAW } from "@/lib/config";
import { decideOpenClawCodeContextMode } from "@/lib/openclaw/chat-context-policy";
import { getOpenClawSurfaceStatus } from "@/lib/openclaw/status";
import { resolveFileContext } from "@/lib/openclaw/resolve-file-context";

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

function normalizeContextText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeCodeSnippet(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

const OPENCLAW_FIELD_VALUE_MAX_CHARS = 220;
const OPENCLAW_RECENT_MESSAGE_MAX_CHARS = 220;
const OPENCLAW_CURRENT_CODE_MAX_CHARS = 1_600;
const OPENCLAW_FULL_CODE_CONTEXT_MAX_CHARS = 18_000;

const SYSTEM_PROMPT = `Du är Sajtagenten — en vänlig, kunnig och hjälpsam svensk AI-assistent inbyggd i Sajtmaskin.

Sajtmaskin är en AI-driven webbplatsbyggare för svenska småföretagare. Användaren beskriver sitt företag eller sin vision i fritext, och AI:n genererar en professionell sajt med modern teknik — ingen programmeringskunskap krävs. Tjänsten drivs av Pretty Good AB.

Huvudflödet:
1. Användaren väljer ingångsmetod (fritext, mall, wizard, kategori eller sajtanalys).
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

function buildContextBlock(
  ctx: Record<string, unknown>,
  options?: {
    fileBlock?: string | null;
    includeCurrentCode?: boolean;
  },
): string {
  const parts: string[] = ["[BUILDER-KONTEXT]"];

  if (ctx.page) parts.push(`Sida: ${ctx.page}`);
  if (ctx.activeEntryMode) parts.push(`Aktivt läge: ${ctx.activeEntryMode}`);
  if (typeof ctx.wizardOpen === "boolean") {
    parts.push(`Wizard öppen: ${ctx.wizardOpen ? "ja" : "nej"}`);
  }
  if (ctx.expandedSection) parts.push(`Öppen sektion: ${ctx.expandedSection}`);
  if (ctx.buildIntent) parts.push(`Byggintention: ${ctx.buildIntent}`);
  if (ctx.chatId) parts.push(`Chatt-ID: ${ctx.chatId}`);
  if (ctx.buildMethod) parts.push(`Byggmetod: ${ctx.buildMethod}`);
  if (ctx.activeVersionId) parts.push(`Aktiv version: ${ctx.activeVersionId}`);
  if (ctx.demoUrl) parts.push(`Demo-URL: ${ctx.demoUrl}`);
  if (ctx.auditUrl) parts.push(`Audit-URL: ${ctx.auditUrl}`);
  if (ctx.auditedUrl) parts.push(`Senast analyserad URL: ${ctx.auditedUrl}`);
  if (ctx.selectedModelLabel) parts.push(`Byggprofil: ${ctx.selectedModelLabel}`);
  if (ctx.promptAssistLabel) parts.push(`Förbättra-modell: ${ctx.promptAssistLabel}`);
  if (typeof ctx.promptAssistDeep === "boolean") {
    parts.push(`Deep brief: ${ctx.promptAssistDeep ? "på" : "av"}`);
  }
  if (ctx.scaffoldMode) parts.push(`Scaffold-läge: ${ctx.scaffoldMode}`);
  if (ctx.scaffoldId) parts.push(`Scaffold: ${ctx.scaffoldId}`);
  if (ctx.isStreaming) parts.push("(AI genererar just nu)");

  if (Array.isArray(ctx.recentMessages) && ctx.recentMessages.length > 0) {
    parts.push("\nSenaste meddelanden i buildern:");
    for (const m of ctx.recentMessages as { role: string; content: string }[]) {
      const role = normalizeContextText(m.role, 24);
      const content = normalizeContextText(
        m.content,
        OPENCLAW_RECENT_MESSAGE_MAX_CHARS,
      );
      if (!role || !content) continue;
      parts.push(`  ${role}: ${content}`);
    }
  }

  if (Array.isArray(ctx.textFields) && ctx.textFields.length > 0) {
    parts.push("\n[SKRIVBARA TEXTFÄLT]");
    for (const field of ctx.textFields.slice(0, 6) as Array<Record<string, unknown>>) {
      const target = normalizeContextText(field.target, 160);
      if (!target) continue;
      const label = normalizeContextText(field.label, 160) || target;
      const kind = normalizeContextText(field.kind, 40) || "text";
      const placeholder = normalizeContextText(field.placeholder, 280);
      const value = normalizeContextText(field.value, OPENCLAW_FIELD_VALUE_MAX_CHARS);
      const canWrite = field.canWrite === false ? "nej" : "ja";
      parts.push(`- target: ${target}`);
      parts.push(`  label: ${label}`);
      parts.push(`  typ: ${kind}`);
      parts.push(`  skrivbar: ${canWrite}`);
      if (placeholder) parts.push(`  placeholder: ${placeholder}`);
      parts.push(`  värde: ${value || "(tomt)"}`);
    }
    parts.push("[/SKRIVBARA TEXTFÄLT]");
  }

  if (options?.fileBlock) {
    parts.push(`\n${options.fileBlock}`);
  } else if (options?.includeCurrentCode) {
    const currentCode = normalizeCodeSnippet(
      ctx.currentCode,
      OPENCLAW_CURRENT_CODE_MAX_CHARS,
    );
    if (currentCode) {
      parts.push(`\nKodavsnitt (första ~${OPENCLAW_CURRENT_CODE_MAX_CHARS} tecken):\n\`\`\`\n${currentCode}\n\`\`\``);
    }
  }

  parts.push("[/BUILDER-KONTEXT]");
  return parts.join("\n");
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
    ];

    if (body.context && typeof body.context === "object") {
      const ctx = body.context;
      let fileBlock: string | null = null;
      const codeContextMode = decideOpenClawCodeContextMode({
        messages: body.messages,
        page: ctx.page,
        chatId: ctx.chatId,
        currentCode: ctx.currentCode,
      });

      const chatId = typeof ctx.chatId === "string" ? ctx.chatId : "";
      const versionId = typeof ctx.activeVersionId === "string" ? ctx.activeVersionId : "";
      if (chatId && (codeContextMode === "manifest" || codeContextMode === "full")) {
        const fc = await resolveFileContext(chatId, versionId || null, {
          includeFullText: codeContextMode === "full",
          maxFullTextChars: OPENCLAW_FULL_CODE_CONTEXT_MAX_CHARS,
          maxManifestFiles: codeContextMode === "full" ? 24 : 16,
        });
        if (fc) {
          fileBlock = codeContextMode === "full" && fc.fullText
            ? `[GENERERADE FILER — ${fc.files.length} filer]\n${fc.fullText}\n[/GENERERADE FILER]`
            : `[FILMANIFEST — ${fc.files.length} filer, kompakt för tokenbudget]\n${fc.manifest}\n[/FILMANIFEST]`;
        }
      }

      messages.push({
        role: "system",
        content: buildContextBlock(ctx, {
          fileBlock,
          includeCurrentCode: codeContextMode === "snippet",
        }),
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
