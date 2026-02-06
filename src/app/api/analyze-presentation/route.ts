/**
 * API Route: Analyze video presentation
 * POST /api/analyze-presentation
 *
 * Takes a transcript + optional keyframe images from a video presentation
 * and provides constructive feedback on tone, pitch quality, clarity,
 * confidence, posture, and eye contact.
 *
 * When frames are provided, uses GPT-4o (vision) via OpenAI directly
 * for visual body language analysis. Falls back to text-only via gateway.
 */

import { NextResponse } from "next/server";
import { generateText, gateway } from "ai";
import { z } from "zod";
import { debugLog, errorLog } from "@/lib/utils/debug";

export const runtime = "nodejs";
export const maxDuration = 45;

const requestSchema = z.object({
  transcript: z.string().min(10, "Transcript too short"),
  companyName: z.string().optional().default(""),
  industry: z.string().optional().default(""),
  language: z.string().optional().default("sv"),
  frames: z.array(z.string()).max(6).optional(),
});

const TEXT_ONLY_PROMPT = `Du ar en uppmutrande presentationscoach. Analysera denna transkribering av en elevator pitch / foretagspresentation.

Svara BARA med JSON i exakt detta format:
{
  "overallScore": 7,
  "toneFeedback": "Kort feedback om ton och energi",
  "clarityFeedback": "Kort feedback om tydlighet och struktur",
  "pitchFeedback": "Kort feedback om elevator pitch-kvalitet",
  "confidenceFeedback": "Kort feedback om sjalvsakerhet i talet",
  "keyMessage": "Vad som kom fram som huvudbudskap",
  "suggestions": ["Forbattringsforslag 1", "Forbattringsforslag 2"],
  "strengthHighlight": "Den starkaste delen av presentationen"
}

Regler:
- Var POSITIV och uppmutrande -- lyft styrkor forst
- overallScore: 1-10 (var generos, de flesta bor fa 6-9)
- Alla texter pa svenska
- Kort och konkret, max 1-2 meningar per falt
- suggestions: max 3, actionable`;

const VISION_PROMPT = `Du ar en uppmutrande presentationscoach. Du far en transkribering av en elevator pitch PLUS stillbilder fran videon. Analysera BADE talet och kroppspraket.

Svara BARA med JSON i exakt detta format:
{
  "overallScore": 7,
  "toneFeedback": "Kort feedback om ton och energi",
  "clarityFeedback": "Kort feedback om tydlighet och struktur",
  "pitchFeedback": "Kort feedback om elevator pitch-kvalitet",
  "confidenceFeedback": "Kort feedback om sjalvsakerhet",
  "postureFeedback": "Kort feedback om hallning och kroppssprak",
  "eyeContactFeedback": "Kort feedback om blickkontakt och narvaro",
  "keyMessage": "Huvudbudskapet som nadde fram",
  "suggestions": ["Forbattringsforslag 1", "Forbattringsforslag 2"],
  "strengthHighlight": "Den starkaste delen av presentationen"
}

Regler for visuell analys:
- Kommentera hallning positivt: rak rygg, avslappnade axlar, oppet kroppssprak
- Kommentera blickkontakt: tittar de i kameran? ar blicken stadig?
- Var POSITIV -- lyft vad som ar bra forst, ge sedan milda forbattringsforslag
- overallScore: 1-10 (generos)
- Alla texter pa svenska, korta (1-2 meningar per falt)
- suggestions: max 3`;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.issues },
        { status: 400 },
      );
    }

    const { transcript, companyName, industry, frames } = parsed.data;
    const hasFrames = frames && frames.length > 0;

    debugLog("PRESENTATION", "Analysis request", {
      transcriptLength: transcript.length,
      frameCount: frames?.length || 0,
      companyName,
      industry,
    });

    const contextLine = [
      companyName ? `Foretag: ${companyName}` : "",
      industry ? `Bransch: ${industry}` : "",
    ]
      .filter(Boolean)
      .join(". ");

    const userTextContent = [
      `Transkribering av presentation:`,
      `"${transcript}"`,
      contextLine ? `\n${contextLine}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    let analysisText: string;

    if (hasFrames) {
      // Use OpenAI directly with vision (GPT-4o supports images)
      analysisText = await analyzeWithVision(userTextContent, frames);
    } else {
      // Text-only via gateway
      analysisText = await analyzeTextOnly(userTextContent);
    }

    // Parse JSON
    let analysis;
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      analysis = null;
    }

    if (!analysis) {
      return NextResponse.json(
        { error: "Kunde inte analysera presentationen." },
        { status: 422 },
      );
    }

    debugLog("PRESENTATION", "Analysis complete", {
      score: analysis.overallScore,
      hasVisual: hasFrames,
    });

    return NextResponse.json({ success: true, analysis });
  } catch (err) {
    errorLog("PRESENTATION", "Analysis error", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/** Analyze with vision model (OpenAI GPT-4o) -- reads images */
async function analyzeWithVision(userText: string, frames: string[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    // Fall back to text-only if no OpenAI key
    return analyzeTextOnly(userText);
  }

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  // Build messages with images
  const imageContents = frames.slice(0, 4).map((frame) => ({
    type: "image_url" as const,
    image_url: {
      url: frame, // base64 data URL
      detail: "low" as const, // Low detail = fast + cheap
    },
  }));

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: VISION_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: userText },
          ...imageContents,
        ],
      },
    ],
    max_tokens: 600,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}

/** Text-only analysis via AI Gateway */
async function analyzeTextOnly(userText: string): Promise<string> {
  const hasGatewayAuth =
    Boolean(process.env.AI_GATEWAY_API_KEY?.trim()) ||
    Boolean(process.env.VERCEL_OIDC_TOKEN?.trim()) ||
    process.env.VERCEL === "1";

  if (hasGatewayAuth) {
    try {
      const result = await generateText({
        model: gateway("openai/gpt-5-mini"),
        messages: [
          { role: "system", content: TEXT_ONLY_PROMPT },
          { role: "user", content: userText },
        ],
        maxOutputTokens: 500,
        providerOptions: {
          gateway: {
            models: ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5"],
          } as any,
        },
      });
      return result.text?.trim() || "";
    } catch {
      // Fall through to OpenAI direct
    }
  }

  // Fallback: OpenAI direct
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("No AI provider available");

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: TEXT_ONLY_PROMPT },
      { role: "user", content: userText },
    ],
    max_tokens: 500,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}
