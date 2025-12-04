/**
 * OpenAI prompts for website audit
 * Uses Responses API with expert model and WebSearch
 */

import type { WebsiteContent } from "@/types/audit";

export type PromptMessage = {
  role: "system" | "user";
  content: Array<{
    type: "text";
    text: string;
  }>;
};

// System prompt for website audit - comprehensive analysis
const AUDIT_SYSTEM_PROMPT = `Du är en senior webb- och teknikrevisor med expertis inom SEO, UX, säkerhet och prestanda. Gör alltid en grundlig teknisk analys av webbplatsen och leverera ENDAST giltig JSON utan Markdown.

LEVERERA JSON MED FÖLJANDE FÄLT (FYLL ALLTID I, ÄVEN OM DU MÅSTE GÖRA EN KVALIFICERAD BEDÖMNING):
{
  "company": "Företagsnamn extraherat från sajten",
  "audit_scores": {
    "seo": 0-100,
    "technical_seo": 0-100,
    "ux": 0-100,
    "content": 0-100,
    "performance": 0-100,
    "accessibility": 0-100,
    "security": 0-100,
    "mobile": 0-100
  },
  "strengths": ["Minst 3-5 konkreta styrkor med detaljer"],
  "issues": ["Minst 5-7 specifika problem att åtgärda"],
  "improvements": [
    {
      "item": "Specifik förbättring",
      "impact": "high|medium|low",
      "effort": "low|medium|high",
      "why": "Detaljerad förklaring varför detta är viktigt",
      "how": "Konkreta implementeringssteg",
      "estimated_time": "Tidsuppskattning"
    }
  ],
  "budget_estimate": {
    "immediate_fixes": { "low": 10000, "high": 25000 },
    "full_optimization": { "low": 40000, "high": 120000 },
    "currency": "SEK"
  },
  "expected_outcomes": ["Mätbart resultat med procent/siffror"],
  "security_analysis": {
    "https_status": "OK/Problem",
    "headers_analysis": "Säkerhetshuvuden-status",
    "cookie_policy": "GDPR-efterlevnad",
    "vulnerabilities": ["Lista med potentiella risker"]
  },
  "competitor_insights": {
    "industry_standards": "Vad som är standard i branschen",
    "missing_features": "Saker sajten saknar jämfört med konkurrenter",
    "unique_strengths": "Unika fördelar"
  },
  "technical_recommendations": [
    {
      "area": "Teknisk domän (t.ex. Performance, SEO, Säkerhet)",
      "current_state": "Nuläge",
      "recommendation": "Åtgärdsförslag",
      "implementation": "Kort kod/konfiguration om relevant"
    }
  ],
  "technical_architecture": {
    "recommended_stack": {
      "frontend": "Förslag",
      "backend": "Förslag", 
      "cms": "Förslag",
      "hosting": "Förslag"
    },
    "integrations": ["Rekommenderade integrationer"],
    "security_measures": ["Prioriterade säkerhetsåtgärder"]
  },
  "priority_matrix": {
    "quick_wins": ["Snabba förbättringar med stor effekt"],
    "major_projects": ["Större projekt som kräver planering"],
    "fill_ins": ["Mindre viktigt men bra att ha"]
  },
  "target_audience_analysis": {
    "demographics": "Uppskattad målgrupp",
    "behaviors": "Beteenden",
    "pain_points": "Smärtpunkter",
    "expectations": "Vad de förväntar sig"
  },
  "content_strategy": {
    "key_pages": ["Viktiga sidor som behövs/saknas"],
    "content_types": ["Rekommenderade innehållstyper"],
    "seo_foundation": "SEO-strategi",
    "conversion_paths": ["Konverteringsflöden"]
  },
  "design_direction": {
    "style": "Nuvarande/rekommenderad stil",
    "color_psychology": "Färgval och betydelse",
    "ui_patterns": ["Rekommenderade UI-mönster"],
    "accessibility_level": "WCAG-nivå"
  },
  "implementation_roadmap": {
    "phase_1": { "duration": "Tidsplan", "deliverables": ["Leverabler"] },
    "phase_2": { "duration": "Tidsplan", "deliverables": ["Leverabler"] },
    "phase_3": { "duration": "Tidsplan", "deliverables": ["Leverabler"] }
  },
  "success_metrics": {
    "kpis": ["Konkreta KPI:er att följa"],
    "tracking_setup": "Rekommenderat analytics-upplägg",
    "review_schedule": "Uppföljningsfrekvens"
  }
}

VIKTIGT:
- Var specifik och detaljerad i varje punkt
- Ge minst 8-10 förbättringsförslag sorterade efter prioritet
- Inkludera konkreta kodexempel där relevant
- Budgetuppskattningar ska vara realistiska för svenska marknaden
- Använd WebSearch för att jämföra med branschstandarder om möjligt
- Svara ENDAST med JSON, ingen Markdown eller annan text`;

/**
 * Build the audit prompt for OpenAI Responses API
 * @param websiteContent - Scraped website content
 * @param url - Original URL
 * @returns Formatted prompt messages
 */
export function buildAuditPrompt(
  websiteContent: WebsiteContent,
  url: string
): PromptMessage[] {
  return [
    {
      role: "system",
      content: [
        {
          type: "text",
          text: AUDIT_SYSTEM_PROMPT,
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Analysera denna webbplats grundligt: ${url}

GRUNDLÄGGANDE INFO:
- Titel: ${websiteContent.title}
- Beskrivning: ${websiteContent.description || "Saknas"}
- SSL/HTTPS: ${websiteContent.hasSSL ? "Ja ✓" : "NEJ - Kritisk säkerhetsbrist!"}
- Svarstid: ${websiteContent.responseTime}ms
- Antal ord: ${websiteContent.wordCount}

RUBRIKER PÅ SIDAN:
${websiteContent.headings
  .slice(0, 10)
  .map((h, i) => `${i + 1}. ${h}`)
  .join("\n")}

LÄNKSTRUKTUR:
- Interna länkar: ${websiteContent.links.internal}
- Externa länkar: ${websiteContent.links.external}
- Bilder: ${websiteContent.images}

META-TAGGAR:
- Keywords: ${websiteContent.meta.keywords || "Saknas"}
- Author: ${websiteContent.meta.author || "Saknas"}
- Viewport: ${websiteContent.meta.viewport || "Saknas (mobilproblem!)"}
- Robots: ${websiteContent.meta.robots || "Standard"}

TEXTINNEHÅLL (första ~800 tecken):
${websiteContent.textPreview}

GÖR EN KOMPLETT ANALYS AV:
1. SEO - Meta-taggar, rubriker, strukturerade data
2. Teknisk SEO - Crawlbarhet, intern länkning, hastighet
3. UX/Användarvänlighet - Navigation, layout, läsbarhet
4. Innehåll - Kvalitet, relevans, engagemang
5. Prestanda - Laddningstid, optimering
6. Tillgänglighet - WCAG, skärmläsare
7. Säkerhet - HTTPS, headers, GDPR
8. Mobilvänlighet - Responsive design

Använd WebSearch för att jämföra med konkurrenter i samma bransch.

Svara ENDAST med välformaterad JSON enligt schemat.`,
        },
      ],
    },
  ];
}

/**
 * Combine prompt messages into single strings for Responses API
 * @param prompt - Array of prompt messages
 * @returns Object with combined input and instructions
 */
export function combinePromptForResponsesApi(prompt: PromptMessage[]): {
  input: string;
  instructions: string;
} {
  let input = "";
  let instructions = "";

  for (const msg of prompt) {
    const combinedContent = msg.content.map((c) => c.text).join("\n");

    if (msg.role === "system") {
      instructions += instructions ? `\n\n${combinedContent}` : combinedContent;
    } else {
      input += input ? `\n\n${combinedContent}` : combinedContent;
    }
  }

  return { input, instructions };
}

/**
 * Extract text from OpenAI Responses API response
 * @param response - API response object
 * @returns Extracted text content
 */
export function extractOutputText(response: Record<string, unknown>): string {
  // Try output_text first (most common)
  if (
    typeof response?.output_text === "string" &&
    response.output_text.trim()
  ) {
    return response.output_text;
  }

  // Try to extract from output array (for tool calls)
  if (Array.isArray(response?.output)) {
    const combined = response.output
      .map((item: Record<string, unknown>) => {
        if (!item?.content) return "";
        if (!Array.isArray(item.content)) return "";

        return item.content
          .map((contentItem: Record<string, unknown>) => {
            const textCandidate = contentItem?.text ?? contentItem?.value;

            if (typeof textCandidate === "string") {
              return textCandidate;
            }

            if (Array.isArray(textCandidate)) {
              return textCandidate
                .map((entry: string | Record<string, unknown>) => {
                  if (typeof entry === "string") return entry;
                  if (typeof entry?.text === "string") return entry.text;
                  if (typeof entry?.value === "string") return entry.value;
                  return "";
                })
                .join("");
            }

            return "";
          })
          .join("");
      })
      .join("\n")
      .trim();

    if (combined) {
      return combined;
    }
  }

  return "";
}

/**
 * Extract first JSON object from text
 * Useful when response contains extra text around JSON
 * @param text - Text that may contain JSON
 * @returns Extracted JSON string or null
 */
export function extractFirstJsonObject(text: string): string | null {
  let start = text.indexOf("{");

  while (start !== -1) {
    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];

      if (inString) {
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        if (char === "\\") {
          escapeNext = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }

    start = text.indexOf("{", start + 1);
  }

  return null;
}
