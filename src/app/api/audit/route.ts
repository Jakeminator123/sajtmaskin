/**
 * API Route: Website Audit
 * POST /api/audit - Analyze a website and return audit results
 *
 * Cost: 3 diamonds
 * Model: gpt-4o with WebSearch enabled
 */

import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import { getCurrentUser } from "@/lib/auth/auth";
import { getUserById, createTransaction, isTestUser } from "@/lib/data/database";
import { SECRETS } from "@/lib/config";
import { scrapeWebsite, validateAndNormalizeUrl } from "@/lib/webscraper";
import {
  buildAuditPrompt,
  combinePromptForResponsesApi,
  extractOutputText,
  extractFirstJsonObject,
  parseJsonWithRepair,
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

// Create a fallback result when AI response is invalid
function createFallbackResult(
  websiteContent: {
    title: string;
    description: string;
    wordCount: number;
    hasSSL: boolean;
    headings: string[];
    meta: { viewport?: string; keywords?: string };
    links: { internal: number; external: number };
    images: number;
    responseTime: number;
  },
  url: string
): Record<string, unknown> {
  const domain = new URL(url).hostname;
  const isJsRendered = websiteContent.wordCount < 50;
  const companyName = websiteContent.title || domain;

  return {
    company: companyName,
    audit_scores: {
      seo: websiteContent.description ? 50 : 30,
      technical_seo: websiteContent.hasSSL ? 60 : 30,
      ux: 50,
      content: isJsRendered ? 40 : websiteContent.wordCount > 200 ? 60 : 40,
      performance: websiteContent.responseTime < 2000 ? 60 : 40,
      accessibility: websiteContent.meta.viewport ? 50 : 30,
      security: websiteContent.hasSSL ? 60 : 20,
      mobile: websiteContent.meta.viewport ? 60 : 30,
    },
    strengths: [
      websiteContent.hasSSL ? "Använder HTTPS/SSL" : null,
      websiteContent.meta.viewport ? "Har viewport meta-tagg för mobil" : null,
      websiteContent.headings.length > 0
        ? `Har ${websiteContent.headings.length} rubriker för struktur`
        : null,
    ].filter(Boolean),
    issues: [
      !websiteContent.hasSSL
        ? "Saknar HTTPS/SSL - kritiskt säkerhetsproblem"
        : null,
      !websiteContent.description ? "Saknar meta-beskrivning för SEO" : null,
      !websiteContent.meta.viewport
        ? "Saknar viewport meta-tagg - mobilproblem"
        : null,
      isJsRendered
        ? "Sidan verkar vara JavaScript-renderad vilket kan påverka SEO negativt"
        : null,
      websiteContent.wordCount < 100
        ? "Mycket lite textinnehåll på sidan"
        : null,
    ].filter(Boolean),
    improvements: [
      {
        item: "Grundläggande SEO-optimering",
        impact: "high",
        effort: "low",
        why: "Förbättrar synlighet i sökmotorer",
        how: "Lägg till meta-beskrivning, optimera rubriker, strukturerade data",
        estimated_time: "1-2 dagar",
      },
      {
        item: "Teknisk granskning behövs",
        impact: "high",
        effort: "medium",
        why: "AI-analysen kunde inte extrahera tillräckligt innehåll från sidan",
        how: "Manuell granskning av källkod och rendering rekommenderas",
        estimated_time: "2-4 timmar",
      },
    ],
    // Minimal site_content based on scraped data
    site_content: {
      company_name: companyName,
      tagline: websiteContent.description || null,
      description:
        websiteContent.description ||
        "Beskrivning kunde inte extraheras automatiskt",
      industry: "Okänd",
      location: null,
      services: [],
      products: [],
      unique_selling_points: [],
      sections: websiteContent.headings.slice(0, 5).map((heading, i) => ({
        name: heading,
        content: heading,
        type: i === 0 ? "hero" : "other",
      })),
      ctas: [],
      contact: {},
    },
    // Default color theme (dark theme as placeholder)
    color_theme: {
      primary_color: "#3b82f6",
      secondary_color: "#1e40af",
      accent_color: "#22c55e",
      background_color: "#0f172a",
      text_color: "#f8fafc",
      theme_type: "dark",
      style_description:
        "Färgtema kunde inte extraheras - standardvärden används",
      design_style: "minimalist",
      typography_style: "Sans-serif, modern",
    },
    // Basic template data
    template_data: {
      generation_prompt: `Skapa en modern webbplats för ${companyName}. ${
        websiteContent.description
          ? `Beskrivning: ${websiteContent.description}.`
          : ""
      } Använd en minimalistisk design med mörkt tema. Inkludera hero-sektion, om oss, tjänster och kontakt.`,
      must_have_sections: ["hero", "about", "services", "contact"],
      style_notes: "Minimalistisk design, mörkt tema, modern typografi",
      improvements_to_apply: [
        "Tydligare värdeerbjudande i hero-sektionen",
        "Bättre call-to-actions",
        "Optimerad mobilvy",
      ],
    },
    _fallback: true,
    _fallback_reason: isJsRendered
      ? "Sidan är JavaScript-renderad och kunde inte analyseras fullt ut"
      : "AI-analysen returnerade inte giltigt resultat",
  };
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
  const hasSiteContent = Boolean(
    r.site_content && typeof r.site_content === "object"
  );
  const hasColorTheme = Boolean(
    r.color_theme && typeof r.color_theme === "object"
  );
  const hasTemplateData = Boolean(
    r.template_data && typeof r.template_data === "object"
  );

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
    hasTechRecs ||
    hasSiteContent ||
    hasColorTheme ||
    hasTemplateData;

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
        pagesSampled: websiteContent.sampledUrls?.length || 1,
      });
    } catch (error) {
      console.error(`[${requestId}] Scraping failed:`, error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Kunde inte hämta hemsidan. Kontrollera URL:en och försök igen.";

      // Return appropriate status code based on error type
      let statusCode = 400;
      if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
        statusCode = 403;
      } else if (
        errorMessage.includes("401") ||
        errorMessage.includes("Unauthorized")
      ) {
        statusCode = 401;
      } else if (
        errorMessage.includes("404") ||
        errorMessage.includes("Not Found")
      ) {
        statusCode = 404;
      } else if (errorMessage.includes("Timeout")) {
        statusCode = 408;
      } else if (
        errorMessage.includes("Serverfel") ||
        errorMessage.includes("50")
      ) {
        statusCode = 502;
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: statusCode }
      );
    }

    // Build prompt
    const prompt = buildAuditPrompt(websiteContent, normalizedUrl);
    const { input, instructions } = combinePromptForResponsesApi(prompt);

    // Call OpenAI Responses API with WebSearch
    console.log(
      `[${requestId}] Calling OpenAI API with model: ${EXPERT_MODEL}`
    );

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
      console.error(
        `[${requestId}] Full response keys:`,
        Object.keys(response || {})
      );
      console.error(
        `[${requestId}] Response preview:`,
        JSON.stringify(response).substring(0, 500)
      );
      return NextResponse.json(
        { success: false, error: "Tom respons från AI. Försök igen." },
        { status: 500 }
      );
    }

    // Log first part of output for debugging
    console.log(
      `[${requestId}] Output text preview (first 300 chars):`,
      outputText.substring(0, 300)
    );

    // Clean output text - remove markdown code blocks if present
    let cleanedOutput = outputText.trim();

    // Remove ```json ... ``` or ``` ... ``` wrapper if present
    const jsonBlockMatch = cleanedOutput.match(
      /```(?:json)?\s*([\s\S]*?)\s*```/
    );
    if (jsonBlockMatch) {
      cleanedOutput = jsonBlockMatch[1].trim();
      console.log(`[${requestId}] Removed markdown code block wrapper`);
    }

    // Remove any text before the first { and after the last }
    const firstBrace = cleanedOutput.indexOf("{");
    const lastBrace = cleanedOutput.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const beforeJson = cleanedOutput.substring(0, firstBrace).trim();
      const afterJson = cleanedOutput.substring(lastBrace + 1).trim();
      if (beforeJson || afterJson) {
        cleanedOutput = cleanedOutput.substring(firstBrace, lastBrace + 1);
        console.log(`[${requestId}] Trimmed text before/after JSON`);
      }
    }

    // Parse JSON response with repair attempts
    let auditResult;
    const parseResult = parseJsonWithRepair(cleanedOutput);

    if (parseResult.success && parseResult.data) {
      auditResult = parseResult.data;
      console.log(`[${requestId}] JSON parse succeeded`);
      console.log(
        `[${requestId}] Parsed result keys:`,
        Object.keys(auditResult as object)
      );
    } else {
      // Try to extract JSON from response if direct parse failed
      console.log(
        `[${requestId}] Direct parse failed, trying extraction:`,
        parseResult.error || "unknown"
      );
      const jsonString = extractFirstJsonObject(outputText);
      if (!jsonString) {
        console.error(
          `[${requestId}] Could not find JSON in response. Full output (first 2000 chars):`,
          outputText.substring(0, 2000)
        );
        return NextResponse.json(
          {
            success: false,
            error:
              "Kunde inte tolka AI-svaret. AI:n returnerade ogiltig JSON. Försök igen.",
          },
          { status: 500 }
        );
      }
      console.log(
        `[${requestId}] Extracted JSON length: ${jsonString.length} chars`
      );

      // Try parsing extracted JSON with repair
      const extractParseResult = parseJsonWithRepair(jsonString);
      if (extractParseResult.success && extractParseResult.data) {
        auditResult = extractParseResult.data;
        console.log(`[${requestId}] Extracted JSON parse succeeded`);
      } else {
        // Log the problematic JSON for debugging (first 1000 chars around error position)
        const errorPos = extractParseResult.error?.match(/position (\d+)/)?.[1];
        const startPos = errorPos ? Math.max(0, parseInt(errorPos) - 500) : 0;
        const endPos = errorPos
          ? Math.min(jsonString.length, parseInt(errorPos) + 500)
          : 1000;
        console.error(
          `[${requestId}] Failed to parse extracted JSON:`,
          extractParseResult.error
        );
        console.error(
          `[${requestId}] Problematic JSON section (chars ${startPos}-${endPos}):`,
          jsonString.substring(startPos, endPos)
        );
        return NextResponse.json(
          {
            success: false,
            error:
              "Kunde inte tolka AI-svaret. JSON-syntaxfel i AI-responsen. Försök igen.",
          },
          { status: 500 }
        );
      }
    }

    // Audit result parsed successfully

    // Check if result is nested inside another object (e.g. { result: {...} } or { audit: {...} })
    const possibleNestedKeys = [
      "result",
      "audit",
      "data",
      "response",
      "audit_result",
    ];
    for (const key of possibleNestedKeys) {
      const nested = (auditResult as Record<string, unknown>)?.[key];
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        // Check if nested object has more audit-like fields
        const nestedObj = nested as Record<string, unknown>;
        if (
          nestedObj.company ||
          nestedObj.audit_scores ||
          nestedObj.improvements ||
          nestedObj.strengths
        ) {
          console.log(
            `[${requestId}] Found nested audit result under key "${key}"`
          );
          auditResult = nested;
          break;
        }
      }
    }

    // Validate result (more lenient - just check it's an object with some data)
    if (!validateAuditResult(auditResult)) {
      const ar = auditResult as Record<string, unknown>;
      console.error(
        `[${requestId}] Invalid audit result. Has fields:`,
        JSON.stringify({
          hasCompany: typeof ar?.company === "string" && ar.company,
          hasImprovements:
            Array.isArray(ar?.improvements) && ar.improvements.length > 0,
          hasScores: ar?.audit_scores && typeof ar.audit_scores === "object",
          hasStrengths: Array.isArray(ar?.strengths) && ar.strengths.length > 0,
          hasIssues: Array.isArray(ar?.issues) && ar.issues.length > 0,
        })
      );
      console.error(
        `[${requestId}] Actual keys present:`,
        Object.keys(ar || {})
      );
      console.error(
        `[${requestId}] Sample values:`,
        JSON.stringify({
          company: ar?.company,
          strengths: Array.isArray(ar?.strengths)
            ? ar.strengths.slice(0, 2)
            : ar?.strengths,
          issues: Array.isArray(ar?.issues)
            ? ar.issues.slice(0, 2)
            : ar?.issues,
        })
      );

      // Try to return partial result anyway if it has ANYTHING useful
      if (
        auditResult &&
        typeof auditResult === "object" &&
        Object.keys(ar).length > 0
      ) {
        console.log(
          `[${requestId}] Returning partial result despite validation failure (${
            Object.keys(ar).length
          } keys)`
        );
      } else {
        // Create a minimal fallback result based on scraped data
        console.log(
          `[${requestId}] Creating fallback result from scraped data`
        );
        auditResult = createFallbackResult(websiteContent, normalizedUrl);
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
