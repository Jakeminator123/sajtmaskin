import type { AuditResult } from "@/types/audit";

function buildSuperPrompt(result: AuditResult | null, auditedUrl?: string | null): string {
if (!result) return "";

const lines: string[] = [];
lines.push("=== BYGG NY SAJT BASERAD PÅ AUDIT ===");

if (auditedUrl) {
  lines.push(`Referenssida: ${auditedUrl}`);
  lines.push(
    "Behåll varumärkeskänslan (färger, logoplacering, tonalitet) men åtgärda alla brister och förbättra UX, prestanda och tillgänglighet.",
  );
}

if (result.company) lines.push(`Företag: ${result.company}`);
if (result.domain) lines.push(`Domän: ${result.domain}`);

if (result.audit_scores) {
  lines.push("");
  lines.push("Audit-poäng att lyfta:");
  const scores = result.audit_scores;
  if (scores.overall) lines.push(`- Övergripande: ${scores.overall}/100`);
  if (scores.seo) lines.push(`- SEO: ${scores.seo}/100`);
  if (scores.performance) lines.push(`- Prestanda: ${scores.performance}/100`);
  if (scores.ux) lines.push(`- UX: ${scores.ux}/100`);
  if (scores.accessibility) lines.push(`- Tillgänglighet: ${scores.accessibility}/100`);
  if (scores.security) lines.push(`- Säkerhet: ${scores.security}/100`);
  if (scores.mobile) lines.push(`- Mobil: ${scores.mobile}/100`);
  if (scores.content) lines.push(`- Innehåll: ${scores.content}/100`);
  if (scores.technical_seo) lines.push(`- Teknisk SEO: ${scores.technical_seo}/100`);
}

if (result.issues && result.issues.length > 0) {
  lines.push("");
  lines.push("Problem att lösa omedelbart:");
  result.issues.slice(0, 6).forEach((issue) => {
    lines.push(`- ${issue}`);
  });
}

if (result.improvements && result.improvements.length > 0) {
  lines.push("");
  lines.push("Förbättringar att implementera:");
  result.improvements.slice(0, 6).forEach((imp) => {
    const contextParts = [];
    if (imp.impact) contextParts.push(`impact: ${imp.impact}`);
    if (imp.effort) contextParts.push(`effort: ${imp.effort}`);
    if (imp.why) contextParts.push(imp.why);
    lines.push(`- ${imp.item}${contextParts.length ? ` (${contextParts.join("; ")})` : ""}`);
  });
}

if (result.strengths && result.strengths.length > 0) {
  lines.push("");
  lines.push("Styrkor att behålla:");
  result.strengths.slice(0, 5).forEach((strength) => {
    lines.push(`- ${strength}`);
  });
}

if (result.design_direction) {
  lines.push("");
  lines.push("Design & identitet:");
  if (result.design_direction.style) lines.push(`- Stil: ${result.design_direction.style}`);
  if (result.design_direction.color_psychology)
    lines.push(`- Färgpsykologi: ${result.design_direction.color_psychology}`);
  if (result.design_direction.ui_patterns)
    lines.push(`- UI-mönster: ${result.design_direction.ui_patterns.join(", ")}`);
  if (result.design_direction.accessibility_level)
    lines.push(`- Tillgänglighet: ${result.design_direction.accessibility_level}`);
}

if (result.target_audience_analysis) {
  lines.push("");
  lines.push("Målgrupp & beteende:");
  if (result.target_audience_analysis.demographics)
    lines.push(`- Demografi: ${result.target_audience_analysis.demographics}`);
  if (result.target_audience_analysis.pain_points)
    lines.push(`- Smärtpunkter: ${result.target_audience_analysis.pain_points}`);
  if (result.target_audience_analysis.expectations)
    lines.push(`- Förväntningar: ${result.target_audience_analysis.expectations}`);
}

if (result.content_strategy?.key_pages && result.content_strategy.key_pages.length > 0) {
  lines.push("");
  lines.push("Nyckelsidor som ska ingå:");
  result.content_strategy.key_pages.slice(0, 8).forEach((page) => {
    lines.push(`- ${page}`);
  });
}

if (result.expected_outcomes && result.expected_outcomes.length > 0) {
  lines.push("");
  lines.push("Mål/effekter att nå:");
  result.expected_outcomes.slice(0, 5).forEach((outcome) => {
    lines.push(`- ${outcome}`);
  });
}

if (result.priority_matrix?.quick_wins && result.priority_matrix.quick_wins.length > 0) {
  lines.push("");
  lines.push("Snabba vinster som ska komma tidigt på sidan:");
  result.priority_matrix.quick_wins.slice(0, 4).forEach((win) => {
    lines.push(`- ${win}`);
  });
}

if (result.security_analysis) {
  lines.push("");
  lines.push("Säkerhet (baka in i copy och implementation):");
  lines.push(`- HTTPS: ${result.security_analysis.https_status}`);
  lines.push(`- Headers: ${result.security_analysis.headers_analysis}`);
  lines.push(`- Cookies/GDPR: ${result.security_analysis.cookie_policy}`);
  if (
    result.security_analysis.vulnerabilities &&
    result.security_analysis.vulnerabilities.length > 0
  ) {
    lines.push(`- Potentiella risker: ${result.security_analysis.vulnerabilities.join(", ")}`);
  }
}

if (result.technical_recommendations && result.technical_recommendations.length > 0) {
  lines.push("");
  lines.push("Tekniska rekommendationer att omsätta:");
  result.technical_recommendations.slice(0, 4).forEach((rec) => {
    lines.push(`- ${rec.area}: ${rec.recommendation} (nuläge: ${rec.current_state})`);
  });
}

lines.push("");
lines.push("Struktur att bygga (anpassa efter innehåll):");
lines.push("- Navigering med logoplatshållare, sektion-ankare, CTA-knapp.");
lines.push(
  "- Hero med tydlig huvudtitel, underrad, primär CTA, sekundär CTA samt visuell bakgrund (bild/gradient) och kort trust-rad.",
);
lines.push(
  "- Sektioner för erbjudanden/tjänster, USP-lista, case/portfolio eller testimonials, ett CTA-block mitt på sidan.",
);
lines.push(
  "- Sektion för innehåll/nyheter eller resurser om relevant, samt FAQ och tydligt kontaktblock med formulär + kontaktuppgifter.",
);
lines.push("- Footer med länkar, sociala ikoner och kontaktinformation.");

lines.push("");
lines.push("Design & kvalitet:");
lines.push("- Använd färger/typo inspirerat av referenssidan.");
lines.push("- Responsivt (mobil först), WCAG AA, hög läsbarhet.");
lines.push("- Optimera bilder (komprimerade) och undvik tunga effekter.");

lines.push("");
lines.push(
  "Språk & ton: Svenska, konkret, säljdrivande men trovärdigt. Anpassa copy till målgruppen.",
);
lines.push(
  "Leverera en klar, konverterande layout som kan genereras i buildern utan ytterligare frågor.",
);

return lines.join("\n");
}

export { buildSuperPrompt };
