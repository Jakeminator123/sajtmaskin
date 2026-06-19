import { NextResponse } from "next/server";

import { ensureSessionIdFromRequest } from "@/lib/auth/session";

import type { DiscoveryPayload } from "@viewser/components/discovery-wizard/wizard-payload";
import { discoveryToBrief } from "@viewser/lib/studio-backend/brief";

/**
 * Native-backed adapter for the ported Sajtbyggaren studio.
 *
 * The studio UI speaks the viewser `/api/prompt` contract; this route maps
 * that onto Sajtmaskin's native own-engine:
 *   - init     -> create app project + POST /api/engine/chats/stream
 *   - followup -> POST /api/engine/chats/[chatId]/stream
 * It drives the engine SSE stream to completion (so the version finalizes),
 * then returns the viewser-shaped result. `siteId` == engine chatId,
 * `runId` == engine versionId.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Codex tier is purpose-built for code generation and far less prone to the
// intermittent "silent output" the fast/mini tier occasionally returns.
const MODEL_TIER = "pro";
// Last-resort tier for the heaviest scaffolds (e.g. ecommerce) where the
// codex tier occasionally returns silent/empty output.
const MODEL_TIER_FALLBACK = "max";

type ToolIntent = { tool: string; params: Record<string, unknown> };
type MarkedSection = { routeId: string; sectionId: string; note?: string };

type PromptPayload = {
  prompt?: string;
  mode?: "init" | "followup";
  siteId?: string;
  baseRunId?: string;
  discovery?: DiscoveryPayload;
  toolIntent?: ToolIntent;
  markedSections?: MarkedSection[];
};

function forwardedHeaders(
  req: Request,
  sessionId: string,
): Record<string, string> {
  const out: Record<string, string> = { "Content-Type": "application/json" };
  const cookie = req.headers.get("cookie");
  if (cookie) out["cookie"] = cookie;
  // Pin BOTH internal calls (project create + engine stream) to one stable
  // session via x-session-id. Without this the two calls can resolve to
  // different guest sessions and the engine rejects the appProjectId as
  // "not owned by this request".
  out["x-session-id"] = sessionId;
  return out;
}

function followupMessage(
  prompt: string | undefined,
  toolIntent: ToolIntent | undefined,
  marked: MarkedSection[] | undefined,
): string {
  const parts: string[] = [];
  if (toolIntent) {
    const p = toolIntent.params ?? {};
    switch (toolIntent.tool) {
      case "theme_change":
        parts.push(
          `Ändra färgtemat på sidan. Önskemål: ${JSON.stringify(p)}.`,
        );
        break;
      case "variant_change":
        parts.push(`Byt designvariant till "${p.variantId ?? p.variant ?? ""}".`);
        break;
      case "section_add":
        parts.push(
          `Lägg till en ny sektion (${p.moduleId ?? p.module ?? "modul"}) på sidan.`,
        );
        break;
      case "content_import":
        parts.push(`Importera och använd innehåll från: ${p.url ?? ""}.`);
        break;
      case "asset_set":
        parts.push(`Använd den uppladdade bilden för rollen "${p.role ?? ""}".`);
        break;
      default:
        parts.push(`Utför ändring (${toolIntent.tool}): ${JSON.stringify(p)}.`);
    }
  }
  if (prompt?.trim()) parts.push(prompt.trim());
  if (marked?.length) {
    parts.push(
      `Berörda sektioner: ${marked
        .map((m) => `${m.routeId}/${m.sectionId}${m.note ? ` (${m.note})` : ""}`)
        .join(", ")}.`,
    );
  }
  return parts.join("\n") || "Förbättra sidan.";
}

/** Drain an engine SSE stream, returning chatId + final version info. */
async function consumeEngineStream(res: Response): Promise<{
  chatId: string | null;
  versionId: string | null;
  buildStatus: "ok" | "failed";
  answerText: string | null;
  error: string | null;
}> {
  const result = {
    chatId: null as string | null,
    versionId: null as string | null,
    buildStatus: "ok" as "ok" | "failed",
    answerText: null as string | null,
    error: null as string | null,
  };
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[PROMPT-ENGINE-ERR]", res.status, text.slice(0, 400));
    result.buildStatus = "failed";
    result.error = text.slice(0, 300) || `Engine HTTP ${res.status}`;
    return result;
  }
  if (!res.body) {
    result.buildStatus = "failed";
    result.error = "No response stream from engine.";
    return result;
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let content = "";

  const handleEvent = (raw: string) => {
    const lines = raw.split("\n");
    let event = "message";
    let dataStr = "";
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataStr += line.slice(5).trim();
    }
    let data: Record<string, unknown> | null = null;
    try {
      data = dataStr ? (JSON.parse(dataStr) as Record<string, unknown>) : null;
    } catch {
      data = null;
    }
    if (event === "chatId" && data?.id) result.chatId = String(data.id);
    else if (event === "content" && typeof data?.text === "string")
      content += data.text;
    else if (event === "done") {
      if (data?.versionId) result.versionId = String(data.versionId);
    } else if (event === "error") {
      result.buildStatus = "failed";
      result.error =
        (data?.message as string) || (data?.error as string) || "Engine error";
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (chunk.trim()) handleEvent(chunk);
    }
  }
  if (buf.trim()) handleEvent(buf);
  result.answerText = content.trim() || null;
  // No finalized version == the model returned silent/empty output. Treat as
  // a failed attempt so the caller can retry (this is an intermittent LLM
  // condition, not a deterministic error).
  if (!result.versionId && result.buildStatus !== "failed") {
    result.buildStatus = "failed";
    if (!result.error) result.error = "Model produced no output (silent run).";
  }
  return result;
}

type EngineResult = Awaited<ReturnType<typeof consumeEngineStream>>;

/** Drive one engine generation, retrying once on a silent/empty run. */
async function runEngineWithRetry(
  url: string,
  init: RequestInit,
  attempts = 3,
): Promise<EngineResult> {
  let last: EngineResult | null = null;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, init);
    last = await consumeEngineStream(res);
    if (last.versionId && last.buildStatus === "ok") return last;
  }
  return (
    last ?? {
      chatId: null,
      versionId: null,
      buildStatus: "failed" as const,
      answerText: null,
      error: "No engine response.",
    }
  );
}

type PromptResult = {
  runId: string;
  siteId: string;
  projectId: string | null;
  version: number | null;
  briefSource: string;
  buildStatus: "ok" | "failed";
  buildResult: Record<string, unknown>;
  answerText: string | null;
  bridge: { applied: boolean; previewShouldRefresh: boolean };
};

/** Run an init/followup build against the native engine; returns the
 *  viewser-shaped result. Throws on unrecoverable errors. */
async function runBuild(
  body: PromptPayload,
  origin: string,
  headers: Record<string, string>,
): Promise<PromptResult> {
  const mode = body.mode ?? "init";

  if (mode === "followup") {
    const chatId = body.siteId;
    if (!chatId) throw new Error("siteId (chatId) krävs för followup.");
    const message = followupMessage(
      body.prompt,
      body.toolIntent,
      body.markedSections,
    );
    const meta: Record<string, unknown> = {};
    if (body.baseRunId) meta.engineBaseVersionId = body.baseRunId;
    const out = await runEngineWithRetry(
      `${origin}/api/engine/chats/${encodeURIComponent(chatId)}/stream`,
      {
        method: "POST",
        headers: { ...headers, Accept: "text/event-stream" },
        body: JSON.stringify({ message, modelId: MODEL_TIER, meta }),
      },
    );
    return {
      runId: out.versionId ?? `${chatId}:latest`,
      siteId: chatId,
      projectId: null,
      version: null,
      briefSource: "followup",
      buildStatus: out.buildStatus,
      buildResult: {},
      answerText: out.answerText,
      bridge: { applied: true, previewShouldRefresh: out.buildStatus === "ok" },
    };
  }

  // ---- init ----
  const discovery = body.discovery;
  // Two message variants for the reliability ladder:
  //  - richMessage: the wizard's full "master prompt" (body.prompt) carrying
  //    the operator's actual company, services, tone etc. → specific, on-brand
  //    copy. This is the primary input so generated content isn't generic.
  //  - leanMessage: the short rawPrompt — used as a fallback because the long
  //    master prompt can tip the heaviest scaffolds into silent output.
  const richMessage = (body.prompt || discovery?.rawPrompt || "").trim();
  const leanMessage = (discovery?.rawPrompt || body.prompt || "").trim();
  if (!richMessage && !leanMessage) throw new Error("Tom prompt.");

  const projectName =
    discovery?.answers?.companyName?.trim() ||
    discovery?.rawPrompt?.trim()?.slice(0, 60) ||
    body.prompt?.trim()?.slice(0, 60) ||
    "Ny sajt";

  const projRes = await fetch(`${origin}/api/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: projectName,
      category: discovery?.contentBranch ?? "business",
    }),
  });
  const projJson = (await projRes.json()) as {
    project?: { id?: string };
    id?: string;
    error?: string;
  };
  const appProjectId = projJson.project?.id ?? projJson.id;
  if (!appProjectId) {
    throw new Error(projJson.error || "Kunde inte skapa projekt.");
  }

  const brief = discovery ? discoveryToBrief(discovery) : undefined;
  const engineUrl = `${origin}/api/engine/chats/stream`;
  const headersSse = { ...headers, Accept: "text/event-stream" };
  const ok = (r: EngineResult) => r.buildStatus === "ok" && !!r.versionId;
  const attempt = (
    msg: string,
    modelId: string,
    withBrief: boolean,
    retries: number,
  ) =>
    runEngineWithRetry(
      engineUrl,
      {
        method: "POST",
        headers: headersSse,
        body: JSON.stringify({
          message: msg,
          modelId,
          meta: { appProjectId, ...(withBrief && brief ? { brief } : {}) },
        }),
      },
      retries,
    );

  // Reliability ladder — best content first, degrading to reliability:
  //  1. rich master prompt + brief (pro, 2 tries) — operator-specific copy.
  //  2. lean prompt, no brief (pro, 1 try) — lighter input if rich went silent.
  //  3. lean prompt, no brief (max, 1 try) — strongest model for heavy scaffolds.
  let out = await attempt(richMessage || leanMessage, MODEL_TIER, true, 2);
  if (!ok(out)) out = await attempt(leanMessage || richMessage, MODEL_TIER, false, 1);
  if (!ok(out)) out = await attempt(leanMessage || richMessage, MODEL_TIER_FALLBACK, false, 1);
  if (out.buildStatus === "failed" && !out.versionId) {
    throw new Error(out.error || "Genereringen misslyckades.");
  }
  const chatId = out.chatId ?? "";
  return {
    runId: out.versionId ?? `${chatId}:v1`,
    siteId: chatId,
    projectId: appProjectId,
    version: 1,
    briefSource: discovery ? "discovery" : "prompt",
    buildStatus: out.buildStatus,
    buildResult: {},
    answerText: out.answerText,
    bridge: { applied: true, previewShouldRefresh: out.buildStatus === "ok" },
  };
}

export async function POST(req: Request) {
  let body: PromptPayload;
  try {
    body = (await req.json()) as PromptPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  // Mint/resolve one stable session and pin internal calls + the browser to it
  // (so /api/runs later sees the freshly-created project).
  const { sessionId, setCookie } = ensureSessionIdFromRequest(req);
  const headers = forwardedHeaders(req, sessionId);
  const wantsNdjson = (req.headers.get("accept") ?? "").includes(
    "application/x-ndjson",
  );

  // NDJSON streaming path (prompt-builder): emit `building` immediately, then
  // `done` (or `error`) when the generation finishes.
  if (wantsNdjson) {
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
        send({ stage: "building" });
        try {
          const result = await runBuild(body, origin, headers);
          send({ stage: "done", ...result });
        } catch (e) {
          send({
            stage: "error",
            error: e instanceof Error ? e.message : "Okänt fel i /api/prompt.",
          });
        } finally {
          controller.close();
        }
      },
    });
    const respHeaders: Record<string, string> = {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    };
    if (setCookie) respHeaders["Set-Cookie"] = setCookie;
    return new Response(stream, { headers: respHeaders });
  }

  // Sync JSON path (floating-chat, use-followup-build).
  try {
    const result = await runBuild(body, origin, headers);
    const res = NextResponse.json(result);
    if (setCookie) res.headers.set("Set-Cookie", setCookie);
    return res;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Okänt fel i /api/prompt." },
      { status: 500 },
    );
  }
}
