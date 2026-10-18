import type { PublicAnalysReport } from "./public-report";

const SCORE_LABELS: Record<string, string> = {
  seo: "SEO",
  technical_seo: "Teknisk SEO",
  ux: "UX",
  content: "Innehåll",
  performance: "Prestanda",
  accessibility: "Tillgänglighet",
  security: "Säkerhet",
  mobile: "Mobil",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safe(value: string | undefined): string {
  return escapeHtml((value ?? "").trim());
}

function renderList(title: string, values: string[] | undefined): string {
  if (!values?.length) return "";
  return `<section><h2>${title}</h2><ul>${values
    .map((value) => `<li>${safe(value)}</li>`)
    .join("")}</ul></section>`;
}

export function generatePublicAnalysPdfHtml(
  report: PublicAnalysReport,
  auditedUrl: string,
): string {
  const scores = Object.entries(report.audit_scores ?? {}).filter(
    (entry): entry is [string, number] => typeof entry[1] === "number",
  );
  const average = scores.length
    ? Math.round(scores.reduce((sum, [, score]) => sum + score, 0) / scores.length)
    : null;
  const title = safe(report.company || report.domain || "Analyserad webbplats");
  const scoreRows = scores
    .map(
      ([key, score]) =>
        `<div class="score"><span>${safe(SCORE_LABELS[key] ?? key)}</span><strong>${Math.max(0, Math.min(100, Math.round(score)))}/100</strong></div>`,
    )
    .join("");
  const improvements = (report.improvements ?? [])
    .map(
      (item, index) => `<article>
        <h3>${index + 1}. ${safe(item.item)}</h3>
        ${item.why ? `<p><strong>Varför:</strong> ${safe(item.why)}</p>` : ""}
        ${item.how ? `<p><strong>Så gör ni:</strong> ${safe(item.how)}</p>` : ""}
      </article>`,
    )
    .join("");

  return `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Webbplatsanalys - ${title}</title>
    <style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#172033;margin:0;padding:32px;line-height:1.5}
      header{border-bottom:3px solid #14b8a6;padding-bottom:20px;margin-bottom:28px}h1{margin:0 0 6px;font-size:30px}
      h2{font-size:19px;margin:28px 0 10px}h3{font-size:15px;margin:0 0 8px}p{margin:6px 0}
      .muted{color:#64748b;word-break:break-all}.summary{font-size:18px}.scores{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
      .score,article{border:1px solid #dbe3ea;border-radius:8px;padding:12px}.score{display:flex;justify-content:space-between}
      article{margin:10px 0;background:#f8fafc}ul{padding-left:20px}@media print{body{padding:0}article{break-inside:avoid}}
    </style>
  </head>
  <body>
    <header>
      <p class="muted">sajtmaskin · Webbplatsanalys</p>
      <h1>${title}</h1>
      <p class="muted">${safe(auditedUrl)}</p>
      ${average === null ? "" : `<p class="summary">Genomsnittligt betyg: <strong>${average}/100</strong></p>`}
    </header>
    ${scoreRows ? `<section><h2>Betyg</h2><div class="scores">${scoreRows}</div></section>` : ""}
    ${report.audience?.primary_segment || report.audience?.demographics ? `<section><h2>Målgrupp</h2>${report.audience.primary_segment ? `<p>${safe(report.audience.primary_segment)}</p>` : ""}${report.audience.demographics ? `<p>${safe(report.audience.demographics)}</p>` : ""}</section>` : ""}
    ${report.seo?.foundation ? `<section><h2>SEO och innehåll</h2><p>${safe(report.seo.foundation)}</p>${renderList("Nyckelsidor", report.seo.key_pages)}</section>` : ""}
    ${renderList("Styrkor", report.strengths)}
    ${renderList("Problem att åtgärda", report.issues)}
    ${improvements ? `<section><h2>Förbättringar</h2>${improvements}</section>` : ""}
    ${renderList("Gör det här först", report.quick_wins)}
    ${renderList("Förväntade effekter", report.expected_outcomes)}
    <footer><p class="muted">Genererad ${safe(new Date().toLocaleDateString("sv-SE"))} · sajtmaskin.se</p></footer>
  </body>
</html>`;
}
