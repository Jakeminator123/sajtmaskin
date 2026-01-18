/**
 * OpenAI prompts for website audit
 * Uses Responses API with expert model and WebSearch
 */

import type { AuditMode, WebsiteContent } from "@/types/audit";

export type PromptMessage = {
  role: "system" | "user";
  content: Array<{
    type: "text";
    text: string;
  }>;
};

// System prompt for website audit - comprehensive analysis
const AUDIT_SYSTEM_PROMPT = `Du är en senior webb- och teknikrevisor med expertis inom SEO, UX, säkerhet och prestanda.

ABSOLUT KRITISKT - FÖLJ DESSA REGLER EXAKT:
1. Du MÅSTE svara med ENDAST giltig JSON - ingen text före eller efter
2. Börja ALLTID ditt svar med { och sluta med }
3. INGEN markdown, INGA \`\`\`json block, INGEN förklarande text
4. Du får ALDRIG returnera ett tomt JSON-objekt {}. Om du saknar data: gör en kvalificerad bedömning och fyll fälten ändå.
5. Om du använder web_search-verktyget, GÖR analysen och returnera sedan JSON-resultatet
6. Om sidan är JavaScript-renderad eller innehållet är tunt: gör 2–3 separata web_search-anrop (t.ex. startsida + tjänstesida + om-oss) innan du analyserar
7. Fyll ALLTID i alla fält - om du saknar information, gör en kvalificerad bedömning
8. EXTRAHERA ALLT TEXTINNEHÅLL från sidan - rubriker, beskrivningar, tjänster, etc.

LEVERERA JSON MED FÖLJANDE FÄLT (FYLL ALLTID I, ÄVEN OM DU MÅSTE GÖRA EN KVALIFICERAD BEDÖMNING):
{
  "audit_mode": "basic|advanced (måste matcha angivet läge)",
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
    "currency": "SEK",
    "payment_structure": "SPECIFIK betalningsmodell anpassad efter företagstyp och omfattning. Exempel: 'Engångsbelopp 15 000 kr för grundläggande SEO-fix + 2 500 kr/mån för löpande underhåll' eller '50% vid projektstart, 50% vid leverans' eller 'Timarvode 950 kr/h, uppskattad omfattning 20-30h'. ALDRIG generiska fraser som 'Fast pris eller löpande'."
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
  "competitor_benchmarking": {
    "industry_leaders": ["Exempel på ledare i branschen"],
    "common_features": ["Gemensamma mönster/funktioner"],
    "differentiation_opportunities": ["Sätt att särskilja sig"]
  },
  "business_profile": {
    "industry": "Bransch/vertikal",
    "company_size": "Uppskattad storlek (t.ex. 1-5 pers, 6-20, 20+)",
    "business_model": "B2C/B2B, online/offline, franchise etc.",
    "maturity": "Startup, etablerad, scale-up eller moget bolag",
    "core_offers": ["Kärnerbjudanden (produkter/tjänster)"],
    "revenue_streams": ["Primära intäktsströmmar"]
  },
  "market_context": {
    "primary_geography": "Primär marknad/region",
    "service_area": "Serviceområde/leveransområde",
    "competition_level": "Låg/medel/hög konkurrens (motivera)",
    "key_competitors": ["Namn på relevanta konkurrenter"],
    "seasonal_patterns": "Säsongsvariationer och efterfrågetoppar",
    "local_market_dynamics": "Lokala trender, köpbeteenden, efterfrågan"
  },
  "customer_segments": {
    "primary_segment": "Primär kundgrupp",
    "secondary_segments": ["Sekundära kundgrupper"],
    "customer_needs": ["Kundbehov/smärtpunkter"],
    "decision_triggers": ["Vad får kunden att agera/köpa"],
    "trust_signals": ["Vad skapar förtroende i branschen"]
  },
  "competitive_landscape": {
    "positioning": "Positionering i förhållande till konkurrenter",
    "differentiation": "Vad som särskiljer företaget",
    "price_positioning": "Prisposition (budget, mid, premium)",
    "barriers_to_entry": "Inträdesbarriärer i marknaden",
    "opportunities": ["Möjliga nischer/positioner att äga"]
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
    "fill_ins": ["Mindre viktigt men bra att ha"],
    "thankless_tasks": ["Nödvändiga men tråkiga saker"]
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
    "phase_1": { "duration": "Tidsplan", "deliverables": ["Leverabler"], "activities": ["Aktiviteter"] },
    "phase_2": { "duration": "Tidsplan", "deliverables": ["Leverabler"], "activities": ["Aktiviteter"] },
    "phase_3": { "duration": "Tidsplan", "deliverables": ["Leverabler"], "activities": ["Aktiviteter"] },
    "launch": { "duration": "Tidsplan", "deliverables": ["Leverabler"], "activities": ["Aktiviteter"] }
  },
  "success_metrics": {
    "kpis": ["Konkreta KPI:er att följa"],
    "tracking_setup": "Rekommenderat analytics-upplägg",
    "review_schedule": "Uppföljningsfrekvens"
  },

  "site_content": {
    "company_name": "Exakt företagsnamn från sidan",
    "tagline": "Slogan/tagline om den finns",
    "description": "Fullständig beskrivning av vad företaget gör (2-4 meningar)",
    "industry": "Bransch (t.ex. 'Webbyrå', 'E-handel', 'Restaurang')",
    "location": "Plats/stad om det framgår",
    "services": ["Lista alla tjänster de erbjuder med beskrivning"],
    "products": ["Lista produkter om de säljer sådana"],
    "unique_selling_points": ["Vad som gör dem unika"],
    "sections": [
      {
        "name": "Sektionsnamn (t.ex. 'Hero', 'Om oss', 'Tjänster')",
        "content": "EXAKT textinnehåll från sektionen - kopiera rubriker, beskrivningar, etc.",
        "type": "hero|services|about|contact|testimonials|portfolio|pricing|faq|team|cta|footer|other"
      }
    ],
    "ctas": ["Alla call-to-action texter (knappar, länkar)"],
    "contact": {
      "email": "Om det finns",
      "phone": "Om det finns",
      "address": "Om det finns",
      "social_links": ["Länkar till sociala medier"]
    }
  },

  "color_theme": {
    "primary_color": "#hexkod för huvudfärg (om synlig)",
    "secondary_color": "#hexkod för sekundär färg",
    "accent_color": "#hexkod för accent/CTA-färg",
    "background_color": "#hexkod för bakgrund",
    "text_color": "#hexkod för textfärg",
    "theme_type": "light|dark|mixed",
    "style_description": "Beskrivning av designstilen (t.ex. 'Minimalistisk, modern, professionell')",
    "design_style": "minimalist|bold|playful|corporate|creative|elegant|tech|organic",
    "typography_style": "Typografisk stil (t.ex. 'Sans-serif, clean, modern')"
  },

  "template_data": {
    "generation_prompt": "En detaljerad prompt för att generera en LIKNANDE men BÄTTRE webbplats. Inkludera: företagsnamn, vad de gör, alla tjänster/produkter, färgschema, designstil, sektioner som ska finnas. Prompten ska kunna användas direkt för att skapa en komplett webbplats.",
    "must_have_sections": ["Lista sektioner som MÅSTE finnas baserat på originalsidan"],
    "style_notes": "Detaljerade stilanteckningar: färger, typografi, layout, spacing, etc.",
    "improvements_to_apply": ["Konkreta förbättringar att implementera i den nya sajten"]
  }
}

VIKTIGT FÖR SITE_CONTENT:
- Extrahera ALLT verkligt textinnehåll från sidan - inte generiska platshållare
- Kopiera EXAKTA rubriker, beskrivningar, tjänstetexter som de står på sidan
- Om du använder web_search, läs av det FAKTISKA innehållet på sidan
- Sections-arrayen ska innehålla varje sektion med dess RIKTIGA innehåll
- Detta är KRITISKT för att kunna bygga en ny sida som liknar originalet

VIKTIGT FÖR COLOR_THEME:
- Försök identifiera de faktiska färgerna som används på sidan
- Om du inte kan se exakta hex-koder, gör en kvalificerad gissning baserat på vad du ser
- Beskriv den övergripande designstilen detaljerat

VIKTIGT FÖR TEMPLATE_DATA:
- generation_prompt ska vara en KOMPLETT prompt som kan användas för att bygga en ny sajt
- Inkludera ALL information om företaget, tjänster, stil, sektioner
- Prompten ska producera en sajt som liknar originalet men är BÄTTRE

ÖVRIGA REGLER:
- SKRIV ALLTID PÅ SVENSKA - all text, alla förklaringar, alla förslag
- Var specifik och detaljerad i varje punkt
- Ge minst 8-10 förbättringsförslag sorterade efter prioritet
- Inkludera konkreta kodexempel där relevant
- Budgetuppskattningar ska vara realistiska för svenska marknaden (SEK)
- Använd WebSearch för att jämföra med branschstandarder om möjligt
- Använd INGA markdown-länkar. Skriv rena domäner/URL:er som vanlig text.
- Svara ENDAST med JSON, ingen Markdown eller annan text
- Alla strängar i JSON ska vara på svenska`;

/**
 * Build the audit prompt for OpenAI Responses API
 * @param websiteContent - Scraped website content
 * @param url - Original URL
 * @returns Formatted prompt messages
 */
export function buildAuditPrompt(
  websiteContent: WebsiteContent,
  url: string,
  auditMode: AuditMode = "basic"
): PromptMessage[] {
  // Detect if this is likely a JS-rendered page with minimal scraped content
  const isJsRendered = websiteContent.wordCount < 50;
  const requiresWebSearch = isJsRendered || auditMode === "advanced";
  const webSearchNote = isJsRendered
    ? `\n\n⚠️ VIKTIGT: Scrapern kunde bara hämta ${websiteContent.wordCount} ord från denna sida. Detta är troligen en JavaScript-renderad webbapp (React, Vue, etc.). ANVÄND WEBSEARCH-VERKTYGET för att besöka och analysera den faktiska renderade sidan på ${url} innan du ger din analys. Gör 2–3 separata web_search-anrop (t.ex. startsida + om oss + tjänster) och sammanställ resultaten.`
    : "";
  const modeLabel = auditMode === "advanced" ? "AVANCERAD" : "VANLIG";
  const modeInstructions =
    auditMode === "advanced"
      ? `\n\nLÄGE: AVANCERAD\n- Gör en bredare marknads- och affärsanalys.\n- Ställ dig själv följdfrågor om bransch, storlek, kundgrupper, geografi och konkurrens innan du svarar.\n- Utför minst 3–5 web_search-anrop (t.ex. varumärkesnamn + stad, konkurrenter, branschstandarder).\n- Fyll business_profile, market_context, customer_segments och competitive_landscape med djup och konkreta antaganden.\n- Ge fler förbättringsförslag (minst 12) och mer detaljerade varför/hur.\n`
      : `\n\nLÄGE: VANLIG\n- Håll affärssektionerna korta men konkreta.\n- Om data saknas: ge en rimlig, kort bedömning baserat på sajten.\n`;

  // Build headings section only if we have headings
  const headingsSection =
    websiteContent.headings.length > 0
      ? `\nRUBRIKER PÅ SIDAN:\n${websiteContent.headings
          .slice(0, 10)
          .map((h, i) => `${i + 1}. ${h}`)
          .join("\n")}`
      : "\nRUBRIKER: Inga rubriker kunde hämtas (använd WebSearch för att se faktiskt innehåll)";

  // Build text preview section
  const textSection =
    websiteContent.textPreview && websiteContent.textPreview.length > 10
      ? `\nTEXTINNEHÅLL (första ~800 tecken):\n${websiteContent.textPreview}`
      : "\nTEXTINNEHÅLL: Kunde inte hämtas (JavaScript-renderad sida - använd WebSearch)";

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
          text: `Analysera denna webbplats grundligt: ${url}${webSearchNote}${modeInstructions}

AUDIT-LÄGE: ${modeLabel} (du MÅSTE sätta "audit_mode" till detta värde)

ANALYSERADE SIDOR (upp till 4):
${(websiteContent.sampledUrls && websiteContent.sampledUrls.length > 0
  ? websiteContent.sampledUrls
  : [websiteContent.url]
)
  .slice(0, 4)
  .map((u, i) => `${i + 1}. ${u}`)
  .join("\n")}

GRUNDLÄGGANDE INFO:
- Titel: ${websiteContent.title}
- Beskrivning: ${websiteContent.description || "Saknas"}
- SSL/HTTPS: ${websiteContent.hasSSL ? "Ja ✓" : "NEJ - Kritisk säkerhetsbrist!"}
- Svarstid: ${websiteContent.responseTime}ms
- Antal ord (agg): ${websiteContent.wordCount}${
            isJsRendered ? " (FÖR LÅGT - använd WebSearch!)" : ""
          }
${headingsSection}

LÄNKSTRUKTUR:
- Interna länkar: ${websiteContent.links.internal}
- Externa länkar: ${websiteContent.links.external}
- Bilder: ${websiteContent.images}

META-TAGGAR:
- Keywords: ${websiteContent.meta.keywords || "Saknas"}
- Author: ${websiteContent.meta.author || "Saknas"}
- Viewport: ${websiteContent.meta.viewport || "Saknas (mobilproblem!)"}
- Robots: ${websiteContent.meta.robots || "Standard"}
${textSection}

GÖR EN KOMPLETT ANALYS AV:
1. SEO - Meta-taggar, rubriker, strukturerade data
2. Teknisk SEO - Crawlbarhet, intern länkning, hastighet
3. UX/Användarvänlighet - Navigation, layout, läsbarhet
4. Innehåll - Kvalitet, relevans, engagemang
5. Prestanda - Laddningstid, optimering
6. Tillgänglighet - WCAG, skärmläsare
7. Säkerhet - HTTPS, headers, GDPR
8. Mobilvänlighet - Responsive design

${
  requiresWebSearch
    ? "DU MÅSTE ANVÄNDA WEBSEARCH för att analysera sidan innan du svarar. Gör flera web_search-anrop och sammanställ resultaten.\n\n"
    : ""
}Använd WebSearch för att jämföra med konkurrenter i samma bransch.

KRITISKT: Svara ENDAST med välformaterad JSON enligt schemat. Ingen markdown, ingen text före eller efter JSON-objektet. Börja direkt med { och sluta med }.`,
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
 * Handles multiple response formats from different API versions
 * @param response - API response object
 * @returns Extracted text content
 */
export function extractOutputText(response: Record<string, unknown>): string {
  // Extract text from OpenAI response structure

  // Try output_text first (Responses API standard)
  if (
    typeof response?.output_text === "string" &&
    response.output_text.trim()
  ) {
    console.log("[extractOutputText] Found output_text");
    return response.output_text;
  }

  // Try choices array (Chat Completions API format)
  if (Array.isArray(response?.choices) && response.choices.length > 0) {
    const choice = response.choices[0] as Record<string, unknown>;
    const message = choice?.message as Record<string, unknown>;
    if (typeof message?.content === "string") {
      console.log("[extractOutputText] Found choices[0].message.content");
      return message.content;
    }
  }

  // Try content directly (some API versions)
  if (typeof response?.content === "string" && response.content.trim()) {
    console.log("[extractOutputText] Found content");
    return response.content;
  }

  // Try text directly
  if (typeof response?.text === "string" && response.text.trim()) {
    console.log("[extractOutputText] Found text");
    return response.text;
  }

  // Try to extract from output array (for tool calls in Responses API)
  if (Array.isArray(response?.output)) {
    console.log(
      "[extractOutputText] Processing output array with",
      response.output.length,
      "items"
    );

    // For Responses API with tools, we need to find the final message output
    // Tool calls come first, then the final message with the actual response
    const textParts: string[] = [];

    for (let idx = 0; idx < response.output.length; idx++) {
      const item = response.output[idx] as Record<string, unknown>;
      console.log(
        `[extractOutputText] Output item ${idx} type:`,
        item?.type,
        "keys:",
        Object.keys(item || {})
      );

      // Skip web_search_call items - we want the final message
      if (item?.type === "web_search_call") {
        console.log(`[extractOutputText] Skipping web_search_call item ${idx}`);
        continue;
      }

      // Handle message type with content array (this is what we want)
      if (item?.type === "message" && Array.isArray(item?.content)) {
        const messageText = (item.content as Array<Record<string, unknown>>)
          .map((c) => {
            if (c?.type === "output_text" && typeof c?.text === "string") {
              return c.text;
            }
            if (c?.type === "text" && typeof c?.text === "string") {
              return c.text;
            }
            if (typeof c?.text === "string") {
              return c.text;
            }
            return "";
          })
          .filter(Boolean)
          .join("");

        if (messageText) {
          console.log(
            `[extractOutputText] Found message content at item ${idx}, length:`,
            messageText.length
          );
          textParts.push(messageText);
        }
        continue;
      }

      // Handle direct content array
      if (Array.isArray(item?.content)) {
        const contentText = (item.content as Array<Record<string, unknown>>)
          .map((contentItem) => {
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
          .filter(Boolean)
          .join("");

        if (contentText) {
          textParts.push(contentText);
        }
        continue;
      }

      // Handle direct text in item
      if (typeof item?.text === "string" && item.text.trim()) {
        textParts.push(item.text);
      }
    }

    if (textParts.length > 0) {
      // Return the last text part (usually the final response after tool calls)
      const finalText = textParts[textParts.length - 1];
      console.log(
        "[extractOutputText] Using final text part, length:",
        finalText.length
      );
      return finalText;
    }
  }

  // Last resort: stringify and look for JSON
  console.log(
    "[extractOutputText] No standard field found, checking full response"
  );
  const responseStr = JSON.stringify(response);

  // Try to find JSON object in the stringified response
  if (
    responseStr.includes('"company"') ||
    responseStr.includes('"audit_scores"')
  ) {
    console.log(
      "[extractOutputText] Response contains audit-like JSON content"
    );
    // Try to extract just the JSON part
    const jsonMatch = responseStr.match(/"text"\s*:\s*"(\{[\s\S]*?\})"/);
    if (jsonMatch) {
      try {
        // Unescape the JSON string
        const unescaped = JSON.parse(`"${jsonMatch[1].replace(/\\"/g, '"')}"`);
        console.log("[extractOutputText] Extracted nested JSON from response");
        return unescaped;
      } catch {
        // Ignore parse errors
      }
    }
  }

  return "";
}

/**
 * Attempt to repair common JSON syntax errors
 * @param jsonString - Potentially malformed JSON string
 * @returns Repaired JSON string
 */
function repairJson(jsonString: string): string {
  let repaired = jsonString;

  // Fix common issues:
  // 1. Remove trailing commas before } or ]
  repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

  // 2. Fix unclosed strings (add closing quote if missing before : or , or })
  // This is a simple heuristic - may not catch all cases
  repaired = repaired.replace(
    /:(\s*)([^",{[\]]+?)(\s*)([,}])/g,
    (match, space1, value, space2, end) => {
      // If value doesn't start with a quote OR a valid literal (number/boolean/null), quote it
      const trimmed = value.trim();
      const looksLikeLiteral = /^("|-?\d|true|false|null)/i.test(trimmed);
      if (!looksLikeLiteral && !trimmed.includes('"')) {
        return `:${space1}"${trimmed}"${space2}${end}`;
      }
      return match;
    }
  );

  // 3. Fix mixed escaped/unescaped quotes in HTML attributes inside strings
  // OpenAI sometimes returns: src=\"...\" loading="..." (mixed escaping)
  // This regex finds strings and fixes unescaped quotes inside them
  repaired = fixMixedQuotesInStrings(repaired);

  // 4. Remove problematic HTML img tags that often cause parse errors
  // Replace <img ...> tags with [image] placeholder
  repaired = repaired.replace(/<img[^>]*>/gi, "[image]");

  // 5. Remove markdown-style links that contain URLs with special chars
  // [text](url) -> text
  repaired = repaired.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  return repaired;
}

/**
 * Fix mixed escaped/unescaped quotes inside JSON string values
 * Handles cases like: "text with src=\"url\" loading=\"lazy\" more"
 * where some quotes are escaped and some aren't
 */
function fixMixedQuotesInStrings(json: string): string {
  const result: string[] = [];
  let i = 0;
  let inString = false;

  while (i < json.length) {
    const char = json[i];

    if (!inString) {
      result.push(char);
      if (char === '"') {
        inString = true;
      }
    } else {
      // Inside a string
      if (char === "\\" && i + 1 < json.length) {
        // Escape sequence - keep as-is
        result.push(char);
        result.push(json[i + 1]);
        i += 2;
        continue;
      }

      if (char === '"') {
        // Check if this quote ends the string or is an unescaped quote inside
        // Look ahead to see if what follows looks like JSON structure
        const afterQuote = json.substring(i + 1, i + 10).trim();
        const looksLikeEndOfString =
          afterQuote.startsWith(",") ||
          afterQuote.startsWith("}") ||
          afterQuote.startsWith("]") ||
          afterQuote.startsWith(":") ||
          afterQuote === "";

        if (looksLikeEndOfString) {
          // This is the real end of string
          result.push(char);
          inString = false;
        } else {
          // This is an unescaped quote inside the string - escape it
          result.push("\\");
          result.push(char);
        }
      } else {
        result.push(char);
      }
    }
    i++;
  }

  return result.join("");
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

/**
 * Parse JSON with automatic repair attempts
 * @param jsonString - JSON string that may have syntax errors
 * @returns Parsed object or null if parsing fails
 */
export function parseJsonWithRepair(jsonString: string): {
  success: boolean;
  data?: unknown;
  error?: string;
} {
  // Try direct parse first
  try {
    return { success: true, data: JSON.parse(jsonString) };
  } catch (error) {
    const firstError = error instanceof Error ? error.message : String(error);

    // Try repair and parse again
    try {
      const repaired = repairJson(jsonString);
      return { success: true, data: JSON.parse(repaired) };
    } catch (repairError) {
      // Try to extract just the JSON object part if there's extra text
      const extracted = extractFirstJsonObject(jsonString);
      if (extracted && extracted !== jsonString) {
        try {
          return { success: true, data: JSON.parse(extracted) };
        } catch {
          try {
            const repairedExtracted = repairJson(extracted);
            return { success: true, data: JSON.parse(repairedExtracted) };
          } catch {
            return {
              success: false,
              error: `JSON parse failed: ${firstError}. Repair attempts also failed.`,
            };
          }
        }
      }

      return {
        success: false,
        error: `JSON parse failed: ${firstError}. Repair attempt failed: ${
          repairError instanceof Error
            ? repairError.message
            : String(repairError)
        }`,
      };
    }
  }
}
