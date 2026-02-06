/**
 * API Route: Analyze video presentation
 * POST /api/analyze-presentation
 *
 * Takes a transcript from a video presentation and provides constructive
 * feedback on tone, pitch quality, clarity, and confidence.
 *
 * Uses AI Gateway (gpt-5-mini) for fast, affordable analysis.
 * Falls back to OpenAI direct if gateway is unavailable.
 */

import { NextResponse } from "next/server";
import { generateText, gateway } from "ai";
import { z } from "zod";
import { debugLog, errorLog } from "@/lib/utils/debug";

export const runtime = "nodejs";
export const maxDuration = 30;

const requestSchema = z.object({
  transcript: z.string().min(10, "Transcript too short"),
  companyName: z.string().optional().default(""),
  industry: z.string().optional().default(""),
  language: z.string().optional().default("sv"),
});

const ANALYSIS_PROMPT = `Du är en uppmuntrande presentationscoach. Analysera denna transkribering av en elevator pitch / företagspresentation.

Svara BARA med JSON i exakt detta format:
{
  "overallScore": 7,
  "toneFeedback": "Kort feedback om ton och energi",
  "clarityFeedback": "Kort feedback om tydlighet och struktur",
  "pitchFeedback": "Kort feedback om elevator pitch-kvalitet",
  "confidenceFeedback": "Kort feedback om självsäkerhet i talet",
  "keyMessage": "Vad som kom fram som huvudbudskap",
  "suggestions": ["Förbättringsförslag 1", "Förbättringsförslag 2"],
  "strengthHighlight": "Den starkaste delen av presentationen"
}

Regler:
- Var POSITIV och uppmuntrande -- lyft styrkor först
- overallScore: 1-10 (var generös, de flesta bör få 6-9)
- Alla texter på svenska
- Kort och konkret, max 1-2 meningar per fält
- suggestions: max 3, actionable
- Om transcriptet är kort/oklart, ge feedback om att utöka`;

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

    const { transcript, companyName, industry } = parsed.data;

    debugLog("PRESENTATION", "Analysis request", {
      transcriptLength: transcript.length,
      companyName,
      industry,
    });

    const userPrompt = [
      `Transkribering av presentation:`,
      `"${transcript}"`,
      companyName ? `\nFöretag: ${companyName}` : "",
      industry ? `Bransch: ${industry}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Try AI Gateway first
    const hasGatewayAuth =
      Boolean(process.env.AI_GATEWAY_API_KEY?.trim()) ||
      Boolean(process.env.VERCEL_OIDC_TOKEN?.trim()) ||
      process.env.VERCEL === "1";

    let analysisText: string;

    if (hasGatewayAuth) {
      try {
        const result = await generateText({
          model: gateway("openai/gpt-5-mini"),
          messages: [
            { role: "system", content: ANALYSIS_PROMPT },
            { role: "user", content: userPrompt },
          ],
          maxOutputTokens: 500,
          providerOptions: {
            gateway: {
              models: ["openai/gpt-5.2", "anthropic/claude-sonnet-4.5"],
            } as any,
          },
        });
        analysisText = result.text?.trim() || "";
      } catch (gwErr) {
        debugLog("PRESENTATION", "Gateway failed, trying OpenAI direct", {
          error: gwErr instanceof Error ? gwErr.message : String(gwErr),
        });
        analysisText = await fallbackOpenAI(userPrompt);
      }
    } else {
      analysisText = await fallbackOpenAI(userPrompt);
    }

    // Parse JSON from response
    let analysis;
    try {
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      analysis = null;
    }

    if (!analysis) {
      return NextResponse.json(
        { error: "Kunde inte analysera presentationen. Försök igen." },
        { status: 422 },
      );
    }

    debugLog("PRESENTATION", "Analysis complete", {
      score: analysis.overallScore,
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

/** Fallback: use OpenAI directly via OPENAI_API_KEY */
async function fallbackOpenAI(userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("No AI provider available for presentation analysis");

  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: ANALYSIS_PROMPT },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 500,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content?.trim() || "";
}
