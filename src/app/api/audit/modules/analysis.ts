import type { AuditMode, AuditResult } from "@/types/audit";

// Cost calculation (for logging/display only)
const USD_TO_SEK = 11.0;

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
  url: string,
  auditMode: AuditMode,
): Record<string, unknown> {
  const domain = new URL(url).hostname;
  const isJsRendered = websiteContent.wordCount < 50;
  const companyName = websiteContent.title || domain;

  return {
    audit_mode: auditMode,
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
      !websiteContent.hasSSL ? "Saknar HTTPS/SSL - kritiskt säkerhetsproblem" : null,
      !websiteContent.description ? "Saknar meta-beskrivning för SEO" : null,
      !websiteContent.meta.viewport ? "Saknar viewport meta-tagg - mobilproblem" : null,
      isJsRendered ? "Sidan verkar vara JavaScript-renderad vilket kan påverka SEO negativt" : null,
      websiteContent.wordCount < 100 ? "Mycket lite textinnehåll på sidan" : null,
    ].filter(Boolean),
    business_profile: {
      industry: "Oklar bransch (kräver manuell kontroll)",
      company_size: "Oklar storlek (uppskattas som småskalig)",
      business_model: "Oklar affärsmodell (troligen B2C)",
      maturity: "Oklar mognadsgrad",
      core_offers: websiteContent.description
        ? [websiteContent.description]
        : ["Kärnerbjudande ej tydligt från scraper"],
      revenue_streams: ["Försäljning av kärnerbjudanden"],
    },
    market_context: {
      primary_geography: "Oklar geografi",
      service_area: "Oklar servicearea",
      competition_level: "Oklar konkurrensnivå",
      key_competitors: [],
      seasonal_patterns: "Oklar säsongsvariation",
      local_market_dynamics: "Oklar lokal marknadsdynamik",
    },
    customer_segments: {
      primary_segment: "Oklar primär kundgrupp",
      secondary_segments: [],
      customer_needs: [],
      decision_triggers: [],
      trust_signals: [],
    },
    competitive_landscape: {
      positioning: "Oklar positionering",
      differentiation: "Oklar differentiering",
      price_positioning: "Oklar prisposition",
      barriers_to_entry: "Oklar inträdesbarriär",
      opportunities: [],
    },
    improvements: [
      {
        item: "Grundläggande SEO-optimering",
        impact: "high",
        effort: "low",
        why: "Förbättrar synlighet i sökmotorer och ökar relevant trafik.",
        how: "Säkerställ unika titles/description, korrekt rubrikhierarki (H1→H2), interna länkar och strukturerad data (JSON-LD).",
        estimated_time: "1-2 dagar",
        technologies: ["HTML", "Metadata", "Structured Data"],
        code_example: "",
        category: "Marketing",
      },
      {
        item: "Förbättra innehåll och värdeerbjudande",
        impact: "high",
        effort: "medium",
        why: "Tydlig copy och struktur ökar konvertering och minskar bounce rate.",
        how: "Skriv en tydlig hero (vad ni gör + för vem + resultat), lägg in 3–6 USP:ar, social proof (logos/case) och en tydlig CTA (t.ex. boka demo/kontakt).",
        estimated_time: "1-3 dagar",
        technologies: ["Copywriting", "UX"],
        code_example: "",
        category: "Content",
      },
      {
        item: "Optimera prestanda (Core Web Vitals)",
        impact: "high",
        effort: "medium",
        why: "Bättre laddtid förbättrar UX, SEO och konvertering.",
        how: "Komprimera bilder, använd lazy-loading, dela upp JS, cachea API-svar, minska onödiga scripts och mät med Lighthouse/PageSpeed.",
        estimated_time: "2-5 dagar",
        technologies: ["Core Web Vitals", "Caching", "Images"],
        code_example: "",
        category: "Tech",
      },
      {
        item: "Tillgänglighet (WCAG AA) och semantik",
        impact: "medium",
        effort: "low",
        why: "Tillgänglighet ger bättre UX och minskar juridisk risk.",
        how: "Säkerställ kontraster, fokus-stilar, semantiska element, alt-texter, korrekt tab-ordning och labels på formulär.",
        estimated_time: "1-2 dagar",
        technologies: ["WCAG", "HTML"],
        code_example: "",
        category: "UX",
      },
      {
        item: "Konverteringsflöde och CTA-strategi",
        impact: "high",
        effort: "low",
        why: "En tydlig CTA och friktionfri väg till kontakt ökar leads.",
        how: "Lägg CTA i header, hero och minst ett mid-page CTA-block. Lägg in kontaktformulär med få fält + kalenderlänk om relevant.",
        estimated_time: "0.5-1 dag",
        technologies: ["UX", "Forms"],
        code_example: "",
        category: "Marketing",
      },
      {
        item: "Säkerhetsbaslinje: HTTPS, headers och cookies",
        impact: "high",
        effort: "low",
        why: "Säkerhet påverkar trust, SEO och regelefterlevnad.",
        how: "Aktivera HTTPS överallt, lägg HSTS, säkra cookies, och säkerställ tydlig cookie-banner + policy (GDPR).",
        estimated_time: "0.5-1 dag",
        technologies: ["HTTPS", "Security Headers"],
        code_example: "",
        category: "Security",
      },
      {
        item: "Spårning och mätplan (GA4 + events)",
        impact: "medium",
        effort: "low",
        why: "Utan mätning blir förbättringar gissningar.",
        how: "Sätt upp GA4, definiera events (CTA-klick, formulär-submit, scroll-depth), och bygg en enkel dashboard för KPI:er.",
        estimated_time: "0.5-1 dag",
        technologies: ["GA4", "Analytics"],
        code_example: "",
        category: "Marketing",
      },
      {
        item: "Teknisk granskning för JS-renderade sidor",
        impact: "medium",
        effort: "medium",
        why: "JS-rendering kan göra att innehåll inte indexeras optimalt och att scraping missar kritisk copy.",
        how: "Verifiera SSR/SSG för viktiga sidor, generera sitemap/metadata server-side, och säkra att kritisk copy finns i initial HTML.",
        estimated_time: "1-3 dagar",
        technologies: ["SSR", "Sitemap", "Metadata"],
        code_example: "",
        category: "Tech",
      },
    ],
    budget_estimate: {
      immediate_fixes: { low: 15000, high: 35000 },
      full_optimization: { low: 60000, high: 180000 },
      currency: "SEK",
      payment_structure: "Fast pris (paket) eller löpande (konsult).",
    },
    expected_outcomes: [
      "Öka organisk trafik med 10–30% inom 3–6 månader (beroende på konkurrens).",
      "Högre konvertering via tydligare CTA och bättre informationshierarki (+5–20%).",
      "Bättre Core Web Vitals vilket ofta ger både SEO- och UX-lyft.",
      "Ökad trust genom social proof, tydligare erbjudande och förbättrad säkerhetsbaslinje.",
    ],
    security_analysis: {
      https_status: websiteContent.hasSSL ? "OK (HTTPS)" : "Problem (saknar HTTPS)",
      headers_analysis:
        "Okänt i fallback-läge. Rekommenderar att verifiera HSTS, CSP, X-Content-Type-Options och Referrer-Policy.",
      cookie_policy:
        "Okänt i fallback-läge. Rekommenderar att granska cookie-banner, lagring och policy (GDPR).",
      vulnerabilities: [
        !websiteContent.hasSSL
          ? "Saknar HTTPS (risk för avlyssning och sänkt trust)."
          : "Verifiera säkerhetshuvuden och cookie-flaggor.",
        "Säkerställ att tredjepartsscripts är minimala och uppdaterade.",
      ].filter(Boolean),
    },
    competitor_insights: {
      industry_standards:
        "Standard är tydlig hero med värdeerbjudande, social proof, tydliga sektioner (tjänster/case), och en stark CTA.",
      missing_features:
        "Vanliga luckor: tydlig CTA-resa, social proof (case/logos), FAQ, och tydliga landningssidor per tjänst/segment.",
      unique_strengths:
        "Bygg vidare på varumärkets tonalitet och differentiera med konkreta resultat, process och tydlig positionering.",
    },
    technical_recommendations: [
      {
        area: "Performance",
        current_state:
          websiteContent.responseTime < 2000
            ? "Serverns svarstid verkar OK."
            : "Serverns svarstid verkar hög.",
        recommendation: "Optimera bundling, minska scripts, komprimera bilder och inför caching.",
        implementation:
          "Next.js: använd Image-optimering, dynamiska imports, och cache headers för statiska resurser.",
      },
      {
        area: "SEO",
        current_state: websiteContent.description
          ? "Meta-beskrivning finns (kontrollera kvalitet/unikhet)."
          : "Meta-beskrivning saknas eller kunde inte hittas.",
        recommendation: "Säkerställ metadata per sida, korrekt rubrikhierarki och sitemap.xml.",
        implementation:
          "Next.js metadata API + generera sitemap/robots + JSON-LD för organisation/tjänster.",
      },
      {
        area: "Accessibility",
        current_state: websiteContent.meta.viewport
          ? "Viewport finns (bra för mobil)."
          : "Viewport saknas (mobilrisk).",
        recommendation: "Säkerställ kontraster, fokus, semantik och label/alt-texter.",
        implementation:
          "Inför WCAG-check i CI, använd semantiska komponenter och testa med skärmläsare.",
      },
      {
        area: "Security",
        current_state: websiteContent.hasSSL ? "HTTPS används." : "HTTPS saknas.",
        recommendation: "Inför säkerhetshuvuden och säkra cookies. Minimera tredjepartsberoenden.",
        implementation:
          "Sätt HSTS, CSP och SameSite/HttpOnly/Secure på cookies där det är relevant.",
      },
    ],
    competitor_benchmarking: {
      industry_leaders: ["Branschledare med stark SEO och tydlig positionering"],
      common_features: ["Tydligt värdeerbjudande", "Snabba laddtider", "Social proof (case/logos)"],
      differentiation_opportunities: [
        "Tydligare nischpositionering",
        "Mer konkret affärsnytta i copy",
      ],
    },
    target_audience_analysis: {
      demographics:
        "Okänt i fallback-läge. Utgå från att besökare är beslutsfattare och stakeholders som vill förstå värde snabbt.",
      behaviors:
        "Skummar hero och sektioner efter proof (case/logos), vill se erbjudande, process och en enkel väg till kontakt/demo.",
      pain_points:
        "Otydligt erbjudande, svag trust, för mycket friktion till kontakt, och lång laddtid på mobil.",
      expectations:
        "Snabb, modern, mobilförst, tydliga CTA:er, konkreta resultat och enkel navigering.",
    },
    content_strategy: {
      key_pages: ["Startsida", "Tjänster", "Case/Portfolio", "Kontakt"],
      content_types: ["Kort copy", "Case studies", "FAQ", "CTA-sektioner"],
      seo_foundation: "Fokusera på tjänstesidor med tydliga sökordscluster och intern länkning.",
      conversion_paths: ["Hero CTA → Kontaktformulär", "Case → Kontakt"],
    },
    design_direction: {
      style: "Modern, professionell och tydligt strukturerad (product/tech-känsla).",
      color_psychology:
        "Använd en tydlig primär accent för CTA och behåll neutral bas för läsbarhet.",
      ui_patterns: [
        "Sticky header med CTA",
        "Hero med primär + sekundär CTA",
        "Social proof (logos/case)",
        "Feature/benefit cards",
        "FAQ + kontaktsektion",
      ],
      accessibility_level: "WCAG 2.1 AA",
    },
    technical_architecture: {
      recommended_stack: {
        frontend: "Next.js",
        backend: "Node.js",
        cms: "Headless CMS",
        hosting: "Vercel",
      },
      integrations: ["Analytics", "CRM", "Email"],
      security_measures: ["HTTPS", "CSP", "HSTS"],
    },
    priority_matrix: {
      quick_wins: ["Tydlig CTA", "Meta-beskrivningar", "Fokusstilar"],
      major_projects: ["Omstrukturera tjänstesidor", "Casebibliotek"],
      fill_ins: ["FAQ", "Team/om oss"],
      thankless_tasks: ["Cookie-policy och compliance"],
    },
    implementation_roadmap: {
      phase_1: {
        duration: "1-2 veckor",
        deliverables: ["Copy-uppdatering", "CTA-struktur"],
        activities: ["Inventera copy", "Uppdatera hero + tjänstesidor"],
      },
      phase_2: {
        duration: "2-4 veckor",
        deliverables: ["Nya sektioner", "SEO-grund"],
        activities: ["Bygga case/FAQ", "Metadata och sitemap"],
      },
      phase_3: {
        duration: "4-6 veckor",
        deliverables: ["Prestandaoptimering", "A11y"],
        activities: ["Core Web Vitals", "Tillgänglighetsfixar"],
      },
      launch: {
        duration: "1 vecka",
        deliverables: ["Lansering", "Tracking"],
        activities: ["QA", "GA4 events", "Sitemap submit"],
      },
    },
    success_metrics: {
      kpis: ["Organisk trafik", "Konvertering", "CTA-klick"],
      tracking_setup: "GA4 + events + enkel dashboard",
      review_schedule: "Månadsvis uppföljning",
    },
    // Minimal site_content based on scraped data
    site_content: {
      company_name: companyName,
      tagline: websiteContent.description || "",
      description: websiteContent.description || "Beskrivning kunde inte extraheras automatiskt",
      industry: "Okänd",
      location: "",
      services: [],
      products: [],
      unique_selling_points: [],
      sections: websiteContent.headings.slice(0, 5).map((heading, i) => ({
        name: heading,
        content: heading,
        type: i === 0 ? "hero" : "other",
      })),
      ctas: [],
      contact: {
        email: "",
        phone: "",
        address: "",
        social_links: [],
      },
    },
    // Default color theme (dark theme as placeholder)
    color_theme: {
      primary_color: "#3b82f6",
      secondary_color: "#1e40af",
      accent_color: "#22c55e",
      background_color: "#0f172a",
      text_color: "#f8fafc",
      theme_type: "dark",
      style_description: "Färgtema kunde inte extraheras - standardvärden används",
      design_style: "minimalist",
      typography_style: "Sans-serif, modern",
    },
    // Basic template data
    template_data: {
      generation_prompt: `Skapa en modern webbplats för ${companyName}. ${
        websiteContent.description ? `Beskrivning: ${websiteContent.description}.` : ""
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
  const hasCompany = typeof r.company === "string" && r.company.trim().length > 0;
  const hasImprovements = Array.isArray(r.improvements) && r.improvements.length > 0;
  const hasScores = Boolean(r.audit_scores && typeof r.audit_scores === "object");
  const hasStrengths = Array.isArray(r.strengths) && r.strengths.length > 0;
  const hasIssues = Array.isArray(r.issues) && r.issues.length > 0;
  const hasBudget = Boolean(r.budget_estimate && typeof r.budget_estimate === "object");
  const hasSecurity = Boolean(r.security_analysis && typeof r.security_analysis === "object");
  const hasTechRecs = Array.isArray(r.technical_recommendations);
  const hasSiteContent = Boolean(r.site_content && typeof r.site_content === "object");
  const hasColorTheme = Boolean(r.color_theme && typeof r.color_theme === "object");
  const hasTemplateData = Boolean(r.template_data && typeof r.template_data === "object");

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

function countWordsFromText(value: string): number {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return 0;
  return normalized.split(" ").length;
}

function countWordsFromList(values?: Array<string | null | undefined>): number {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, item) => {
    if (!item) return sum;
    return sum + countWordsFromText(item);
  }, 0);
}

function estimateWordCountFromSiteContent(siteContent?: AuditResult["site_content"]): number {
  if (!siteContent) return 0;

  let count = 0;
  count += countWordsFromText(siteContent.company_name || "");
  count += countWordsFromText(siteContent.tagline || "");
  count += countWordsFromText(siteContent.description || "");
  count += countWordsFromText(siteContent.industry || "");
  count += countWordsFromText(siteContent.location || "");
  count += countWordsFromList(siteContent.services);
  count += countWordsFromList(siteContent.products);
  count += countWordsFromList(siteContent.unique_selling_points);
  count += countWordsFromList(siteContent.ctas);

  if (Array.isArray(siteContent.sections)) {
    for (const section of siteContent.sections) {
      count += countWordsFromText(section.name || "");
      count += countWordsFromText(section.content || "");
    }
  }

  if (siteContent.contact) {
    count += countWordsFromList([
      siteContent.contact.email,
      siteContent.contact.phone,
      siteContent.contact.address,
    ]);
    count += countWordsFromList(siteContent.contact.social_links);
  }

  return count;
}

/**
 * Approximate USD per 1M tokens for cost display (provider list prices change;
 * figures are indicative, not billing truth).
 */
function getPricingForModel(model: string): { input: number; output: number } {
  const m = model.toLowerCase();
  if (m.includes("gpt-5.2")) return { input: 1.25, output: 10 };
  if (m.includes("opus")) return { input: 15, output: 75 };
  if (m.includes("sonnet")) return { input: 3, output: 15 };
  if (m.includes("claude")) return { input: 3, output: 15 };
  return { input: 2, output: 10 };
}

/** Matches HTTP 5xx status codes mentioned in error strings (avoids loose "50" substring). */
function messageLooksLikeHttp5xx(message: string): boolean {
  return /\b5\d{2}\b/.test(message);
}

export {
  USD_TO_SEK,
  createFallbackResult,
  validateAuditResult,
  estimateWordCountFromSiteContent,
  getPricingForModel,
  messageLooksLikeHttp5xx,
};
