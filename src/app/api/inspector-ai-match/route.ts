import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentUser } from "@/lib/auth/auth";
import { getBuilderInspectorDisabledMessage, isBuilderInspectorEnabled } from "@/lib/builder/inspector-feature";
import { workloadChatReasoningEffort } from "@/lib/ai-models/workload-reasoning";
import { calculateModelCost } from "@/lib/billing/model-cost";
import { INSPECTOR_AI_MATCH_DEFAULT_MODEL } from "@/lib/gen/defaults";
import { isOpenAIReasoningModelId } from "@/lib/models/openai-capabilities";
import { withRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;
const REQUEST_TIMEOUT_MS = 30_000;

const INSPECTOR_AI_MATCH_WORKLOAD_ID = "inspector_ai_match";
const MODEL = INSPECTOR_AI_MATCH_DEFAULT_MODEL;
const MAX_CODE_CHARS = 12_000;
const MAX_FILES = 6;
/** Total output ceiling, including Sol medium reasoning tokens. Not a measured cost. */
const MAX_OUTPUT_TOKENS = 8_192;

function getDirectApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY;
  return key?.trim() || null;
}

type ClientConfig = {
  client: OpenAI;
  modelId: string;
};

function createClientConfig(): ClientConfig | null {
  const directKey = getDirectApiKey();
  if (directKey) {
    return {
      client: new OpenAI({ apiKey: directKey }),
      modelId: MODEL,
    };
  }
  return null;
}

const requestSchema = z.object({
  xPercent: z.number().finite().min(0).max(100),
  yPercent: z.number().finite().min(0).max(100),
  viewportWidth: z.number().finite().min(0).max(100_000).optional().default(0),
  viewportHeight: z.number().finite().min(0).max(100_000).optional().default(0),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(1_000),
        content: z.string().max(2_000_000),
      }),
    )
    .min(1)
    .max(1_000),
});

function truncateCode(files: Array<{ name: string; content: string }>): string {
  const eligible = files
    .filter((f) => /\.(tsx|jsx|css)$/i.test(f.name))
    .slice(0, MAX_FILES);

  const parts: string[] = [];
  let totalChars = 0;
  for (const file of eligible) {
    const budget = MAX_CODE_CHARS - totalChars;
    if (budget <= 200) break;
    const trimmed = file.content.slice(0, budget);
    parts.push(`--- ${file.name} ---\n${trimmed}`);
    totalChars += trimmed.length + file.name.length + 10;
  }
  return parts.join("\n\n");
}

export async function POST(req: Request) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Logga in för att använda AI-matchning." },
      { status: 401 },
    );
  }
  return withRateLimit(req, "inspector:ai-match", () => handlePOST(req), { userId: user.id });
}

async function handlePOST(req: Request) {
  if (!isBuilderInspectorEnabled()) {
    return NextResponse.json(
      { success: false, error: getBuilderInspectorDisabledMessage() },
      { status: 503 },
    );
  }

  const clientConfig = createClientConfig();
  if (!clientConfig) {
    return NextResponse.json(
      {
        success: false,
        error: "Ingen AI-nyckel konfigurerad (OPENAI_API_KEY krävs).",
      },
      { status: 501 },
    );
  }

  const parsedBody = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json(
      { success: false, error: "Kräver giltiga xPercent, yPercent, viewport och files[]." },
      { status: 400 },
    );
  }
  const body = parsedBody.data;

  const codeBlock = truncateCode(body.files);
  if (!codeBlock) {
    return NextResponse.json(
      { success: false, error: "Inga TSX/JSX/CSS-filer att analysera." },
      { status: 400 },
    );
  }

  const systemPrompt = `Du är en expert på React/Next.js-layouter.
Användaren klickade på en punkt i en preview-vy. Utifrån koordinaterna och källkoden, identifiera EXAKT vilken JSX-komponent/element som troligast ligger vid den punkten.

Svara ALLTID med ett JSON-objekt (inga markdown-backticks):
{
  "tag": "elementets HTML/JSX-tagg (t.ex. button, div, h1, a, section)",
  "text": "synlig text i elementet, eller null",
  "className": "relevanta CSS-klasser, eller null",
  "filePath": "filnamn där elementet definieras",
  "lineNumber": radnummer (heltal),
  "confidence": "high" | "medium" | "low",
  "reasoning": "kort förklaring på svenska (max 2 meningar)"
}

Tänk på:
- Viewport-koordinater anges i procent (0%=topp/vänster, 100%=botten/höger)
- Flexbox/grid-layout: räkna ut ungefärlig position baserat på CSS-klasser
- Tailwind-klasser som flex, grid, h-screen, w-full etc ger ledtrådar om layout
- Navbar/header är typiskt vid y=0-10%, footer vid y=90-100%
- Om osäker, ange confidence="low"`;

  const userPrompt = `Klickposition: x=${body.xPercent.toFixed(1)}%, y=${body.yPercent.toFixed(1)}%
Viewport: ${body.viewportWidth}x${body.viewportHeight}px

Källkod:
${codeBlock}`;

  try {
    const completion = await clientConfig.client.chat.completions.create({
      model: clientConfig.modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      // Reasoning models reject `max_tokens` and custom temperature. Sol has no
      // `none`; effort comes from the workload helper. Classic models keep temperature.
      ...(isOpenAIReasoningModelId(clientConfig.modelId)
        ? {
            max_completion_tokens: MAX_OUTPUT_TOKENS,
            ...workloadChatReasoningEffort(INSPECTOR_AI_MATCH_WORKLOAD_ID, clientConfig.modelId),
          }
        : { max_tokens: 300, temperature: 0.1 }),
    }, { signal: req.signal, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });

    const usage = completion.usage;
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    const costUsd =
      calculateModelCost(clientConfig.modelId, {
        inputTokens,
        cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens ?? 0,
        cacheWriteTokens: 0,
        outputTokens,
      })?.costUsd ?? null;

    const raw = completion.choices[0]?.message?.content?.trim() || "";

    let parsed: Record<string, unknown> | null = null;
    try {
      const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      parsed = null;
    }

    return NextResponse.json({
      success: true,
      model: MODEL,
      element: parsed
        ? {
            tag: String(parsed.tag || "unknown"),
            text: parsed.text ? String(parsed.text) : null,
            className: parsed.className ? String(parsed.className) : null,
            filePath: parsed.filePath ? String(parsed.filePath) : null,
            lineNumber: typeof parsed.lineNumber === "number" ? parsed.lineNumber : null,
            confidence: String(parsed.confidence || "low"),
            reasoning: parsed.reasoning ? String(parsed.reasoning) : null,
          }
        : null,
      rawResponse: raw,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      cost:
        costUsd === null
          ? null
          : {
              usd: Number(costUsd.toFixed(6)),
              display:
                costUsd < 0.001 ? `$${(costUsd * 100).toFixed(4)}c` : `$${costUsd.toFixed(4)}`,
            },
    });
  } catch (err) {
    console.error("[API/inspector-ai-match] Provider request failed:", err);
    return NextResponse.json(
      { success: false, error: "AI-matchning misslyckades" },
      { status: 502 },
    );
  }
}

