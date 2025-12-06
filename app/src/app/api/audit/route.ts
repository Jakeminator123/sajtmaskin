/**
 * API Route: Website Audit
 * POST /api/audit - Analyze a website and return audit results
 *
 * Cost: 3 diamonds
 * Model: gpt-4o with WebSearch enabled
 */

import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import { getCurrentUser } from "@/lib/auth";
import {
  getUserById,
  createTransaction,
  isTestUser,
  TEST_USER_DIAMONDS,
} from "@/lib/database";
import { SECRETS } from "@/lib/config";
import { scrapeWebsite, validateAndNormalizeUrl } from "@/lib/webscraper";
import {
  buildAuditPrompt,
  combinePromptForResponsesApi,
  extractOutputText,
  extractFirstJsonObject,
} from "@/lib/audit-prompts";
import type { AuditResult, AuditRequest } from "@/types/audit";

// Extend timeout for long-running AI calls
export const maxDuration = 300; // 5 minutes

// Audit cost in diamonds
const AUDIT_COST = 3;

// Model configuration - use expert model with fallback
const EXPERT_MODEL = "gpt-4o"; // Use gpt-4o as it's the most reliable expert model
const FALLBACK_MODEL = "gpt-4o-mini";

// Cost calculation (for logging/display only)
const USD_TO_SEK = 11.0;
const PRICE_IN_PER_MTOK = 2.5; // gpt-4o input
const PRICE_OUT_PER_MTOK = 10.0; // gpt-4o output

// Initialize OpenAI client lazily
function getOpenAIClient(): OpenAI {
  const apiKey = SECRETS.openaiApiKey;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
  return new OpenAI({
    apiKey,
    timeout: 300000, // 5 minute timeout
    maxRetries: 2,
  });
}

// Validate audit result structure (lenient - accept partial results)
function validateAuditResult(result: unknown): result is AuditResult {
  if (!result || typeof result !== "object") return false;

  const r = result as Record<string, unknown>;

  // Accept if we have ANY of these fields with meaningful content
  const hasCompany =
    typeof r.company === "string" && r.company.trim().length > 0;
  const hasImprovements =
    Array.isArray(r.improvements) && r.improvements.length > 0;
  const hasScores = Boolean(
    r.audit_scores && typeof r.audit_scores === "object"
  );
  const hasStrengths = Array.isArray(r.strengths) && r.strengths.length > 0;
  const hasIssues = Array.isArray(r.issues) && r.issues.length > 0;
  const hasBudget = Boolean(
    r.budget_estimate && typeof r.budget_estimate === "object"
  );
  const hasSecurity = Boolean(
    r.security_analysis && typeof r.security_analysis === "object"
  );
  const hasTechRecs = Array.isArray(r.technical_recommendations);

  // Very lenient - just needs to be an object with at least one key
  const hasAnyContent = Object.keys(r).length > 0;

  // Must have content AND at least one useful field
  const hasUsefulField =
    hasCompany ||
    hasImprovements ||
    hasScores ||
    hasStrengths ||
    hasIssues ||
    hasBudget ||
    hasSecurity ||
    hasTechRecs;

  return hasAnyContent && hasUsefulField;
}

export async function POST(request: NextRequest) {
  const requestId = `audit_${Date.now()}_${Math.random()
    .toString(36)
    .substring(7)}`;
  const requestStartTime = Date.now();

  try {
    // Parse request body
    let body: AuditRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: "Ogiltig JSON i förfrågan" },
        { status: 400 }
      );
    }

    const { url } = body;

    // Validate URL
    let normalizedUrl: string;
    try {
      normalizedUrl = validateAndNormalizeUrl(url);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Ogiltig URL. Ange en giltig webbadress.",
        },
        { status: 400 }
      );
    }

    console.log(`[${requestId}] Audit request for: ${normalizedUrl}`);

    // Check authentication and credits
    const user = await getCurrentUser(request);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Du måste vara inloggad för att använda audit-funktionen.",
          requiresAuth: true,
        },
        { status: 401 }
      );
    }

    // Get fresh user data from database
    const dbUser = getUserById(user.id);
    if (!dbUser) {
      return NextResponse.json(
        { success: false, error: "Användare hittades inte." },
        { status: 404 }
      );
    }

    // Check if user has enough diamonds (test users have unlimited)
    const isTest = isTestUser(dbUser);
    if (!isTest && dbUser.diamonds < AUDIT_COST) {
      return NextResponse.json(
        {
          success: false,
          error: `Du behöver minst ${AUDIT_COST} diamanter för att köra en audit. Du har ${dbUser.diamonds} diamanter.`,
          insufficientCredits: true,
          required: AUDIT_COST,
          current: dbUser.diamonds,
        },
        { status: 402 }
      );
    }

    console.log(
      `[${requestId}] User ${user.id} has ${dbUser.diamonds} diamonds (test: ${isTest})`
    );

    // Scrape website content
    console.log(`[${requestId}] Scraping website...`);
    let websiteContent;
    try {
      websiteContent = await scrapeWebsite(normalizedUrl);
      console.log(`[${requestId}] Scraping completed:`, {
        title: websiteContent.title?.substring(0, 50),
        wordCount: websiteContent.wordCount,
        headingsCount: websiteContent.headings.length,
      });
    } catch (error) {
      console.error(`[${requestId}] Scraping failed:`, error);
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Kunde inte hämta hemsidan. Kontrollera URL:en och försök igen.",
        },
        { status: 400 }
      );
    }

    // Build prompt
    const prompt = buildAuditPrompt(websiteContent, normalizedUrl);
    const { input, instructions } = combinePromptForResponsesApi(prompt);

    // Call OpenAI Responses API with WebSearch
    console.log(
      `[${requestId}] Calling OpenAI API with model: ${EXPERT_MODEL}`
    );

    const openai = getOpenAIClient();
    let response;
    let usedModel = EXPERT_MODEL;

    try {
      response = await getOpenAIClient().responses.create(
        {
          model: EXPERT_MODEL,
          input: input,
          instructions: instructions || undefined,
          max_output_tokens: 16000,
          tools: [{ type: "web_search" }], // Enable WebSearch
        },
        {
          timeout: 300000,
        }
      );
    } catch (apiError: unknown) {
      const err = apiError as { code?: string; message?: string };

      // If model not found, try fallback
      if (
        err.code === "model_not_found" ||
        err.message?.includes("model") ||
        err.message?.includes("not found")
      ) {
        console.warn(
          `[${requestId}] Model ${EXPERT_MODEL} not available, trying ${FALLBACK_MODEL}`
        );
        usedModel = FALLBACK_MODEL;

        response = await getOpenAIClient().responses.create(
          {
            model: FALLBACK_MODEL,
            input: input,
            instructions: instructions || undefined,
            max_output_tokens: 16000,
            tools: [{ type: "web_search" }],
          },
          {
            timeout: 300000,
          }
        );
      } else {
        throw apiError;
      }
    }

    const apiDuration = Date.now() - requestStartTime;
    console.log(
      `[${requestId}] API call completed in ${apiDuration}ms using ${usedModel}`
    );

    // Extract and parse response
    const outputText = extractOutputText(
      response as unknown as Record<string, unknown>
    );

    if (!outputText || outputText.trim().length === 0) {
      console.error(`[${requestId}] Empty response from API`);
      return NextResponse.json(
        { success: false, error: "Tom respons från AI. Försök igen." },
        { status: 500 }
      );
    }

    // Processing audit output

    // Parse JSON response
    let auditResult;
    try {
      auditResult = JSON.parse(outputText);
      console.log(`[${requestId}] Direct JSON parse succeeded`);
    } catch (parseError) {
      console.log(
        `[${requestId}] Direct parse failed, trying extraction:`,
        parseError instanceof Error ? parseError.message : "unknown"
      );
      // Try to extract JSON from response
      const jsonString = extractFirstJsonObject(outputText);
      if (!jsonString) {
        console.error(
          `[${requestId}] Could not find JSON in response. Full output:`,
          outputText.substring(0, 2000)
        );
        return NextResponse.json(
          { success: false, error: "Kunde inte tolka AI-svaret. Försök igen." },
          { status: 500 }
        );
      }
      console.log(
        `[${requestId}] Extracted JSON length: ${jsonString.length} chars`
      );
      try {
        auditResult = JSON.parse(jsonString);
      } catch (extractParseError) {
        console.error(
          `[${requestId}] Failed to parse extracted JSON:`,
          extractParseError instanceof Error
            ? extractParseError.message
            : "unknown"
        );
        return NextResponse.json(
          { success: false, error: "Kunde inte tolka AI-svaret. Försök igen." },
          { status: 500 }
        );
      }
    }

    // Audit result parsed successfully

    // Validate result (more lenient - just check it's an object with some data)
    if (!validateAuditResult(auditResult)) {
      console.error(
        `[${requestId}] Invalid audit result. Has fields:`,
        JSON.stringify({
          hasCompany: typeof auditResult?.company === "string",
          hasImprovements: Array.isArray(auditResult?.improvements),
          hasScores: typeof auditResult?.audit_scores === "object",
          hasStrengths: Array.isArray(auditResult?.strengths),
          hasIssues: Array.isArray(auditResult?.issues),
        })
      );
      // Try to return partial result anyway if it has ANYTHING useful
      if (auditResult && typeof auditResult === "object") {
        console.log(
          `[${requestId}] Returning partial result despite validation failure`
        );
      } else {
        return NextResponse.json(
          {
            success: false,
            error: "AI-svaret saknar nödvändig information. Försök igen.",
          },
          { status: 500 }
        );
      }
    }

    // Calculate cost (for display)
    interface Usage {
      input_tokens?: number;
      output_tokens?: number;
      prompt_tokens?: number;
      completion_tokens?: number;
    }
    const usage = ((response as { usage?: Usage }).usage || {}) as Usage;
    const inputTokens = usage.input_tokens || usage.prompt_tokens || 0;
    const outputTokens = usage.output_tokens || usage.completion_tokens || 0;
    const costUSD =
      (inputTokens * PRICE_IN_PER_MTOK + outputTokens * PRICE_OUT_PER_MTOK) /
      1_000_000;
    const costSEK = costUSD * USD_TO_SEK;

    // Add metadata to result
    const domain = new URL(normalizedUrl).hostname;
    const result: AuditResult = {
      ...auditResult,
      audit_type: "website_audit",
      domain,
      timestamp: new Date().toISOString(),
      cost: {
        tokens: inputTokens + outputTokens,
        sek: parseFloat(costSEK.toFixed(2)),
        usd: parseFloat(costUSD.toFixed(4)),
      },
    };

    // Deduct diamonds (only if not test user)
    if (!isTest) {
      try {
        createTransaction(
          user.id,
          "audit",
          -AUDIT_COST,
          `Site Audit: ${domain}`
        );
        console.log(
          `[${requestId}] Deducted ${AUDIT_COST} diamonds from user ${user.id}`
        );
      } catch (txError) {
        console.error(`[${requestId}] Failed to deduct diamonds:`, txError);
        // Still return result even if transaction fails
      }
    } else {
      console.log(`[${requestId}] Test user - no diamonds deducted`);
    }

    const totalDuration = Date.now() - requestStartTime;
    console.log(`[${requestId}] Audit completed in ${totalDuration}ms`);

    return NextResponse.json(
      {
        success: true,
        result,
      },
      {
        headers: {
          "X-Request-ID": requestId,
          "X-Response-Time": `${totalDuration}ms`,
        },
      }
    );
  } catch (error: unknown) {
    const totalDuration = Date.now() - requestStartTime;
    const err = error as { message?: string; status?: number; code?: string };

    console.error(`[${requestId}] Audit error after ${totalDuration}ms:`, {
      message: err.message,
      status: err.status,
      code: err.code,
    });

    // Provide user-friendly error messages
    let errorMessage = "Ett fel uppstod vid analysen. Försök igen senare.";

    if (err.status === 401) {
      errorMessage = "API-nyckel saknas eller är ogiltig.";
    } else if (err.status === 429) {
      errorMessage = "För många förfrågningar. Vänta en stund och försök igen.";
    } else if (err.message?.includes("timeout")) {
      errorMessage = "Analysen tog för lång tid. Försök med en enklare sida.";
    } else if (err.message?.includes("ENOTFOUND")) {
      errorMessage = "Kunde inte nå webbplatsen. Kontrollera URL:en.";
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
