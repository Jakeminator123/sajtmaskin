import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withRateLimit } from "@/lib/rateLimit";
import { OPENCLAW } from "@/lib/config";
import {
  decideOpenClawRoutingIntent,
  getLatestOpenClawUserText,
  OPENCLAW_ROUTING_STRATEGY,
} from "@/lib/openclaw/chat-context-policy";
import { getOpenClawSurfaceStatus } from "@/lib/openclaw/status";
import { buildOpenClawContextSystemMessage } from "@/lib/openclaw/server-context";
import { buildOpenClawReviewContext } from "@/lib/openclaw/review-context";
import { resolveReviewReasoningEffort, DEFAULT_DEBUG_EFFORT } from "@/lib/openclaw/review-tuning";
import {
  buildOpenClawRepoContextBlock,
  isRepoContextConfigured,
} from "@/lib/openclaw/debug/repo-context";
import { queryDebugFindings } from "@/lib/db/services/debug-findings";
import { getEngineVersionForChatByIdForRequest } from "@/lib/tenant";

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
- När användaren UTTRYCKLIGEN ber dig laga/fixa buggar OCH det finns konkreta fynd under [BUGGFYND] för den aktiva versionen, får du ge en kort förklaring och sedan lägga exakt ett action-block sist i svaret i detta format:
<openclaw-action>
{"type":"request_repair","label":"Kort etikett","reason":"Kort motivering grundad i [BUGGFYND]"}
</openclaw-action>
- request_repair startar en vanlig reparation som skapar en NY version att godkänna. Du ändrar ALDRIG filer direkt och ska aldrig påstå att buggen redan är fixad — säg att en reparation startas efter att användaren godkänt. Föreslå det bara när det finns [BUGGFYND] och användaren ber om en fix; annars förklara fynden utan action-block.
- Du får inte klicka på knappar, skicka formulär, publicera live eller ändra inställningar åt användaren.
- Påstå aldrig att du redan har fyllt ett fält innan användaren har godkänt det.
- Kodkontext skickas sparsamt för att spara tokens. Om du inte ser kod i kontexten ska du inte hitta på detaljer, utan be om en mer specifik kodfråga eller relevant buildervy/version.
- Nämn ALDRIG Vercel, v0, v0 Platform API eller specifik underliggande infrastruktur. Säg istället "publicera live", "vår AI-motor" eller "modern molninfrastruktur".
- Nämn ALDRIG interna namn som "dossier", "scaffold-matcher", "tier-3 build spec", "capability-inference" eller andra arkitekturdetaljer för användaren. Säg "byggblock", "modul" eller "färdiga komponenter" om sådana funktioner kommer på tal.`;

/**
 * Builder-prompt-tips loaded once at module init from
 * `data/openclaw/builder-prompt-tips.md`. Appended as a separate system
 * message so the assistant can cite concrete prompting advice (visual vs
 * functional separation, keyword triggers for built-in modules, F3 key
 * guidance) without restating it in every response. Falls back to an
 * empty string if the file cannot be read so the route never crashes.
 */
const BUILDER_PROMPT_TIPS = (() => {
  try {
    const path = join(
      process.cwd(),
      "data",
      "openclaw",
      "builder-prompt-tips.md",
    );
    return readFileSync(path, "utf8").trim();
  } catch (error) {
    console.warn(
      "[openclaw/chat] builder-prompt-tips.md not loadable — assistant will run without prompt tips:",
      error instanceof Error ? error.message : error,
    );
    return "";
  }
})();

function buildRoutingSystemPrompt(intent: "general" | "review"): string {
  if (intent === "review") {
    return `Internt läge: review.

Publik yta och API ska förbli samma Sajtagenten-yta. Om frågan kräver djupare analys ska det ske som intern review/eskalering bakom Sajtagenten (${OPENCLAW_ROUTING_STRATEGY}), inte som en separat synlig agent för användaren.

Prioritera de 1-3 viktigaste observationerna eller ändringsförslagen. Håll svaret kort även när du använder djupare builder- eller kodkontext.`;
  }

  return `Internt läge: assistans.

Håll dig till kort, tydlig vägledning. Använd bara djup kodgranskning när användaren uttryckligen ber om review, felsökning eller förbättringsanalys.`;
}

/**
 * Debug-mode (OC_DEBUG) system instructions. Unlocks armed autonomy (Mode A):
 * OpenClaw still reasons first and never builds unprompted, but after an
 * explicit arming directive it may fill the builder prompt and click send for a
 * bounded number of follow-ups. Also tells it how to use the extra debug context
 * (full code, persisted findings, read-only Sajtmaskin source) to reason about
 * where the PLATFORM itself is buggy. OpenClaw never edits Sajtmaskin's code.
 */
function buildDebugSystemPrompt(): string {
  return `Internt läge: DEBUG (OC_DEBUG på).

Du har nu utökad kontext: full genererad projektkod, persisterade verifierings-/reparationsfynd ([BUGGFYND]/[TIDSLINJE]/[OC-DEBUG-FYND]) och ibland read-only utdrag ur Sajtmaskins EGEN källkod ([SAJTMASKIN-KÄLLKOD]). Använd dem för att resonera konkret om var bygget OCH var plattformen själv brister. Du kan ALDRIG ändra Sajtmaskins kod — bara läsa och resonera.

Armerad autonomi (gör detta först efter att användaren uttryckligen ber om det):
- Du bygger ALDRIG en sajt oombett. Resonera först.
- När användaren armerar dig ("granska nästa meddelande jag skapar" eller "gör N follow-ups och buggranska det suspekta"), bekräfta kort och lägg ett action-block sist:
<openclaw-action>
{"type":"start_bug_hunt","mode":"followups","count":5,"reason":"Kort motivering"}
</openclaw-action>
- När du är armerad och ska skicka en follow-up i buildern: ge en kort förklaring och lägg ett action-block sist som fyller OCH skickar:
<openclaw-action>
{"type":"fill_text_field","target":"builder.chat.primary","value":"Din follow-up-prompt","submit":true}
</openclaw-action>
- Skicka EN follow-up i taget, vänta in resultatet, läs fynden och välj nästa suspekta steg. Respektera mandatets antal. Om användaren skriver "stopp" – sluta omedelbart och skicka inga fler.
- "submit":true respekteras bara i debug-läge med ett aktivt mandat; annars fylls fältet men skickas inte.`;
}

const OPENCLAW_DEBUG_FINDINGS_MAX = 12;

/**
 * Compact `[OC-DEBUG-FYND]` block from the bug-hunt's own `oc_debug_findings`
 * for the active version. Debug-mode only; null when there are none so the
 * prompt stays lean.
 */
async function buildOpenClawDebugFindingsBlock(
  versionId: string,
): Promise<string | null> {
  const rows = await queryDebugFindings({ versionId, limit: OPENCLAW_DEBUG_FINDINGS_MAX });
  const relevant = rows.filter((row) => row.severity !== "info");
  if (relevant.length === 0) return null;
  const parts: string[] = [
    "[OC-DEBUG-FYND] Strukturerade fynd från debug-läges bug-hunt för denna version. Använd dem för konkreta svar; hitta aldrig på fynd.",
  ];
  for (const row of relevant.slice(0, OPENCLAW_DEBUG_FINDINGS_MAX)) {
    const loc = row.file ? ` ${row.file}${row.line ? `:${row.line}` : ""}` : "";
    const build = row.build_result ? ` (build: ${row.build_result})` : "";
    parts.push(`- [${row.severity}|${row.category ?? "?"}]${loc} ${row.message}${build}`);
  }
  parts.push("[/OC-DEBUG-FYND]");
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

    const routingIntent = decideOpenClawRoutingIntent({ messages: body.messages });
    const debug = OPENCLAW.debugEnabled;
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: buildRoutingSystemPrompt(routingIntent),
      },
    ];

    if (debug) {
      messages.push({ role: "system", content: buildDebugSystemPrompt() });
    }

    if (BUILDER_PROMPT_TIPS) {
      messages.push({ role: "system", content: BUILDER_PROMPT_TIPS });
    }

    if (body.context && typeof body.context === "object") {
      const contextMessage = await buildOpenClawContextSystemMessage({
        messages: body.messages,
        context: body.context,
        currentCodeMaxChars: OPENCLAW_CURRENT_CODE_MAX_CHARS,
        fullCodeContextMaxChars: OPENCLAW_FULL_CODE_CONTEXT_MAX_CHARS,
        debug,
      });
      messages.push({
        role: "system",
        content: contextMessage.content,
      });

      // Fas 1: on review/bug intent, surface the REAL persisted verify/repair
      // findings for the active version (errorManifest, failed checks) so the
      // assistant answers with concrete diagnostics instead of guessing.
      // Compact + DB-guarded; null when nothing actionable, so normal chat
      // stays cheap.
      if (routingIntent === "review" || debug) {
        const reviewChatId =
          typeof body.context.chatId === "string" ? body.context.chatId : null;
        const reviewVersionId =
          typeof body.context.activeVersionId === "string"
            ? body.context.activeVersionId
            : null;
        // Cross-tenant guard (Codex P1): `activeVersionId` is client-supplied,
        // so verify the REQUESTER owns this chat+version (tenant-scoped lookup)
        // before reading its diagnostics — never surface another tenant's
        // findings/timeline from a forged version id.
        const scopedVersion =
          reviewChatId && reviewVersionId
            ? await getEngineVersionForChatByIdForRequest(
                req,
                reviewChatId,
                reviewVersionId,
              ).catch(() => null)
            : null;
        if (scopedVersion) {
          // Fas 1 (findings) + Fas 4 (timeline) share a single DB read, keyed
          // by the OWNERSHIP-VERIFIED version id.
          const { findings: findingsBlock, timeline: timelineBlock } =
            await buildOpenClawReviewContext({
              chatId: reviewChatId,
              versionId: scopedVersion.version.id,
            });
          if (findingsBlock) {
            messages.push({ role: "system", content: findingsBlock });
          }
          if (timelineBlock) {
            messages.push({ role: "system", content: timelineBlock });
          }

          // Debug-mode: surface the bug-hunt's own structured findings for this
          // version (from oc_debug_findings), keyed by the ownership-verified id.
          if (debug) {
            const debugBlock = await buildOpenClawDebugFindingsBlock(
              scopedVersion.version.id,
            ).catch(() => null);
            if (debugBlock) {
              messages.push({ role: "system", content: debugBlock });
            }
          }
        }

        // Debug-mode: attach read-only Sajtmaskin source so OpenClaw can reason
        // about WHERE THE PLATFORM ITSELF is buggy. Bounded + only when the user
        // is actually probing internals (keeps token/network cost in check).
        if (debug && isRepoContextConfigured()) {
          const latestUserText = getLatestOpenClawUserText(body.messages);
          if (
            routingIntent === "review" ||
            /sajtmaskin|plattform|platform|rotorsak|root\s?cause|pipeline|\.tsx?\b/i.test(
              latestUserText,
            )
          ) {
            const repoBlock = await buildOpenClawRepoContextBlock().catch(() => null);
            if (repoBlock) {
              messages.push({ role: "system", content: repoBlock });
            }
          }
        }
      }
    }

    for (const m of body.messages) {
      if (!m.role || !m.content) continue;
      messages.push({
        role: m.role,
        content: typeof m.content === "string" ? m.content.slice(0, 8_000) : String(m.content),
      });
    }

    // Fas 3: make the assistant reason harder on review/bug intent via the
    // OpenAI-compatible `reasoning_effort` field (codex-class models honor it).
    // Sent on review intent and in debug-mode (debug defaults to xhigh — the
    // hardest async agentic tier, ideal for bug-hunt). Env-reversible (set
    // OPENCLAW_REVIEW_REASONING_EFFORT=off).
    const reviewReasoningEffort =
      routingIntent === "review" || debug
        ? resolveReviewReasoningEffort(
            process.env.OPENCLAW_REVIEW_REASONING_EFFORT,
            debug ? { defaultEffort: DEFAULT_DEBUG_EFFORT } : undefined,
          )
        : null;

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
          ...(reviewReasoningEffort ? { reasoning_effort: reviewReasoningEffort } : {}),
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
