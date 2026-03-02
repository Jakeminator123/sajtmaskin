import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "gpt-4o-mini";
const MAX_CODE_CHARS = 12_000;
const MAX_FILES = 6;

const INPUT_COST_PER_M = 0.15;
const OUTPUT_COST_PER_M = 0.6;

function getGatewayApiKey(): string | null {
  const key = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  return key?.trim() || null;
}

function getDirectApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY;
  return key?.trim() || null;
}

function createClient(): OpenAI | null {
  const gatewayKey = getGatewayApiKey();
  if (gatewayKey) {
    return new OpenAI({
      apiKey: gatewayKey,
      baseURL: "https://ai-gateway.vercel.sh/v1",
    });
  }
  const directKey = getDirectApiKey();
  if (directKey) {
    return new OpenAI({ apiKey: directKey });
  }
  return null;
}

type RequestBody = {
  xPercent: number;
  yPercent: number;
  viewportWidth: number;
  viewportHeight: number;
  files: Array<{ name: string; content: string }>;
};

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
  const client = createClient();
  if (!client) {
    return NextResponse.json(
      { success: false, error: "Ingen AI-nyckel konfigurerad (AI_GATEWAY_API_KEY eller OPENAI_API_KEY)." },
      { status: 501 },
    );
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null;
  if (!body?.files?.length || !Number.isFinite(body.xPercent) || !Number.isFinite(body.yPercent)) {
    return NextResponse.json(
      { success: false, error: "Kräver xPercent, yPercent och files[]." },
      { status: 400 },
    );
  }

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
    const modelId = getGatewayApiKey() ? `openai/${MODEL}` : MODEL;
    const completion = await client.chat.completions.create({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 300,
    });

    const usage = completion.usage;
    const inputTokens = usage?.prompt_tokens ?? 0;
    const outputTokens = usage?.completion_tokens ?? 0;
    const costUsd =
      (inputTokens / 1_000_000) * INPUT_COST_PER_M +
      (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;

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
      cost: {
        usd: Number(costUsd.toFixed(6)),
        display: costUsd < 0.001 ? `$${(costUsd * 100).toFixed(4)}c` : `$${costUsd.toFixed(4)}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI-matchning misslyckades";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
