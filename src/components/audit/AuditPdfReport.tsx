"use client";

import type { AuditResult } from "@/types/audit";

interface AuditPdfReportProps {
  result: AuditResult;
  onClose: () => void;
}

// ── SVG Chart Generators ──────────────────────────────────────────

function generateRadarChartSVG(scores: Record<string, number | undefined>): string {
  const entries = Object.entries(scores).filter(
    ([, v]) => typeof v === "number",
  ) as [string, number][];
  if (entries.length < 3) return "";

  const cx = 160;
  const cy = 160;
  const maxR = 130;
  const levels = 5;
  const n = entries.length;

  // Grid circles and labels
  let gridLines = "";
  for (let i = 1; i <= levels; i++) {
    const r = (maxR * i) / levels;
    gridLines += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="0.5" stroke-dasharray="${i < levels ? "2,2" : "0"}"/>`;
    if (i % 2 === 0) {
      gridLines += `<text x="${cx + 4}" y="${cy - r + 4}" fill="#94a3b8" font-size="8" font-family="system-ui">${(i * 100) / levels}</text>`;
    }
  }

  // Axis lines and labels
  let axisLines = "";
  const LABELS: Record<string, string> = {
    seo: "SEO",
    technical_seo: "Teknisk SEO",
    ux: "UX",
    content: "Innehall",
    performance: "Prestanda",
    accessibility: "Tillganglighet",
    security: "Sakerhet",
    mobile: "Mobil",
  };

  entries.forEach(([key], i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x2 = cx + maxR * Math.cos(angle);
    const y2 = cy + maxR * Math.sin(angle);
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#e5e7eb" stroke-width="0.5"/>`;

    // Label positioning
    const labelR = maxR + 18;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle);
    const anchor =
      Math.abs(Math.cos(angle)) < 0.1 ? "middle" : Math.cos(angle) > 0 ? "start" : "end";
    axisLines += `<text x="${lx}" y="${ly + 4}" fill="#374151" font-size="9" font-weight="600" font-family="system-ui" text-anchor="${anchor}">${LABELS[key] || key}</text>`;
  });

  // Data polygon
  const points = entries
    .map(([, value], i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = (maxR * (value || 0)) / 100;
      return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`;
    })
    .join(" ");

  // Score dots
  const dots = entries
    .map(([, value], i) => {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = (maxR * (value || 0)) / 100;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      const color = (value || 0) >= 80 ? "#22c55e" : (value || 0) >= 60 ? "#f59e0b" : "#ef4444";
      return `<circle cx="${x}" cy="${y}" r="4" fill="${color}" stroke="white" stroke-width="1.5"/>`;
    })
    .join("");

  return `<svg viewBox="0 0 320 320" width="320" height="320" xmlns="http://www.w3.org/2000/svg">
    ${gridLines}
    ${axisLines}
    <polygon points="${points}" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="2"/>
    ${dots}
  </svg>`;
}

function generateBarChartSVG(scores: Record<string, number | undefined>): string {
  const entries = Object.entries(scores).filter(
    ([, v]) => typeof v === "number",
  ) as [string, number][];
  if (!entries.length) return "";

  const LABELS: Record<string, string> = {
    seo: "SEO",
    technical_seo: "Teknisk SEO",
    ux: "UX",
    content: "Innehall",
    performance: "Prestanda",
    accessibility: "Tillganglighet",
    security: "Sakerhet",
    mobile: "Mobil",
  };

  const barH = 28;
  const gap = 8;
  const labelW = 100;
  const chartW = 400;
  const totalH = entries.length * (barH + gap) + 10;
  const barW = chartW - labelW - 50;

  const bars = entries
    .map(([key, value], i) => {
      const y = i * (barH + gap) + 5;
      const w = (barW * (value || 0)) / 100;
      const color = (value || 0) >= 80 ? "#22c55e" : (value || 0) >= 60 ? "#f59e0b" : "#ef4444";
      const bgColor = (value || 0) >= 80 ? "#f0fdf4" : (value || 0) >= 60 ? "#fffbeb" : "#fef2f2";

      return `
        <g transform="translate(0, ${y})">
          <text x="${labelW - 8}" y="${barH / 2 + 4}" fill="#374151" font-size="10" font-weight="500" font-family="system-ui" text-anchor="end">${LABELS[key] || key}</text>
          <rect x="${labelW}" y="0" width="${barW}" height="${barH}" rx="4" fill="#f1f5f9"/>
          <rect x="${labelW}" y="0" width="${w}" height="${barH}" rx="4" fill="${bgColor}" stroke="${color}" stroke-width="1"/>
          <rect x="${labelW}" y="2" width="${Math.max(w - 4, 0)}" height="${barH - 4}" rx="3" fill="${color}" opacity="0.2"/>
          <rect x="${labelW}" y="${barH / 2 - 3}" width="${w}" height="6" rx="3" fill="${color}"/>
          <text x="${labelW + barW + 8}" y="${barH / 2 + 4}" fill="${color}" font-size="12" font-weight="700" font-family="system-ui">${value}</text>
        </g>
      `;
    })
    .join("");

  return `<svg viewBox="0 0 ${chartW} ${totalH}" width="${chartW}" height="${totalH}" xmlns="http://www.w3.org/2000/svg">
    ${bars}
  </svg>`;
}

function generateScoreCircleSVG(score: number): string {
  const r = 56;
  const cx = 70;
  const cy = 70;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (circumference * score) / 100;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const grade =
    score >= 90 ? "A+" : score >= 80 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : score >= 50 ? "D" : "F";

  return `<svg viewBox="0 0 140 140" width="140" height="140" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="10"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="10"
      stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
      transform="rotate(-90 ${cx} ${cy})"/>
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" fill="#1a1a1a" font-size="32" font-weight="800" font-family="system-ui">${score}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="${color}" font-size="16" font-weight="700" font-family="system-ui">${grade}</text>
  </svg>`;
}

// ── SVG Icons (replacing emojis) ──────────────────────────────────

const SVG_ICONS = {
  check: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="display:inline;vertical-align:middle;margin-right:4px"><circle cx="8" cy="8" r="8" fill="#22c55e"/><path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warning: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M8 1L15 14H1L8 1z" fill="#f59e0b"/><text x="8" y="12" text-anchor="middle" fill="white" font-size="10" font-weight="700">!</text></svg>',
  bulb: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="display:inline;vertical-align:middle;margin-right:4px"><circle cx="8" cy="6" r="5" fill="#3b82f6"/><rect x="6" y="11" width="4" height="3" rx="1" fill="#3b82f6"/><path d="M5.5 6c0-1.38 1.12-2.5 2.5-2.5" stroke="white" stroke-width="1" stroke-linecap="round"/></svg>',
  gear: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="display:inline;vertical-align:middle;margin-right:4px"><circle cx="8" cy="8" r="3" stroke="#6366f1" stroke-width="1.5"/><circle cx="8" cy="8" r="6.5" stroke="#6366f1" stroke-width="1" stroke-dasharray="2,3"/></svg>',
  shield: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M8 1L2 4v4c0 3.31 2.55 6.4 6 7 3.45-.6 6-3.69 6-7V4L8 1z" fill="#0ea5e9"/><path d="M5.5 8l2 2 3-3" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trophy: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="display:inline;vertical-align:middle;margin-right:4px"><path d="M5 2h6v5a3 3 0 01-6 0V2z" fill="#f59e0b"/><rect x="7" y="10" width="2" height="3" fill="#f59e0b"/><rect x="5" y="13" width="6" height="1.5" rx="0.5" fill="#f59e0b"/></svg>',
  money: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="display:inline;vertical-align:middle;margin-right:4px"><circle cx="8" cy="8" r="7" fill="#10b981"/><text x="8" y="11.5" text-anchor="middle" fill="white" font-size="10" font-weight="700">$</text></svg>',
};

// ── Main Component ────────────────────────────────────────────────

/**
 * Professional audit report with SVG charts and clean typography.
 * Uses browser print for PDF generation.
 */
export function AuditPdfReport({ result, onClose }: AuditPdfReportProps) {
  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Tillat popup-fonster for att generera PDF");
      return;
    }

    const scores = result.audit_scores || {};
    const avgScore = calculateAvgScore(scores);
    const safeDomain = escapeHtml(result.domain || "Rapport");
    const safeCompanyOrDomain = escapeHtml(
      result.company || result.domain || "Analyserad webbplats",
    );
    const auditModeLabel = result.audit_mode === "advanced" ? "Avancerad" : "Standard";
    const faviconUrl = result.domain
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(result.domain)}&sz=64`
      : "";
    const scrape = result.scrape_summary;
    const wordCountLabel = scrape
      ? scrape.word_count_source === "ai_estimate"
        ? `${scrape.aggregated_word_count} ord (AI-estimerat)`
        : `${scrape.aggregated_word_count} ord`
      : "";
    const dateStr = new Date().toLocaleDateString("sv-SE", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Generate SVG charts
    const radarChart = generateRadarChartSVG(scores);
    const barChart = generateBarChartSVG(scores);
    const scoreCircle = generateScoreCircleSVG(avgScore);

    // Get top 3 issues for executive summary
    const topIssues = (result.issues || []).slice(0, 3);
    const topStrengths = (result.strengths || []).slice(0, 3);
    const topImprovements = (result.improvements || []).slice(0, 3);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="sv">
      <head>
        <meta charset="UTF-8">
        <title>Webbplatsanalys - ${safeDomain}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }

          @page {
            size: A4;
            margin: 18mm 20mm 22mm 20mm;
            @bottom-center {
              content: counter(page) " / " counter(pages);
              font-family: 'Inter', system-ui, -apple-system, sans-serif;
              font-size: 8pt;
              color: #94a3b8;
            }
          }

          body {
            font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
            font-size: 10pt;
            line-height: 1.6;
            color: #1e293b;
            background: white;
          }

          /* ── Cover Page ─────────────────────────────────── */

          .cover {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            page-break-after: always;
            position: relative;
            padding: 40px;
          }

          .cover::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 6px;
            background: linear-gradient(90deg, #3b82f6, #8b5cf6, #06b6d4);
          }

          .cover-logo {
            font-size: 28pt;
            font-weight: 800;
            letter-spacing: -1.5px;
            color: #3b82f6;
            margin-bottom: 60px;
          }

          .cover-logo span { color: #1e293b; }

          .cover-score {
            margin-bottom: 40px;
          }

          .cover-title {
            font-size: 28pt;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 8px;
            letter-spacing: -0.5px;
          }

          .cover-domain {
            font-size: 16pt;
            color: #3b82f6;
            font-weight: 500;
            margin-bottom: 40px;
          }

          .cover-meta {
            display: flex;
            gap: 30px;
            font-size: 9pt;
            color: #64748b;
          }

          .cover-meta-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
          }

          .cover-meta-label {
            font-size: 7pt;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: #94a3b8;
            font-weight: 600;
          }

          /* ── Section Headers ────────────────────────────── */

          .page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 12px;
            border-bottom: 2px solid #e2e8f0;
            margin-bottom: 24px;
          }

          .page-header-brand {
            font-size: 10pt;
            font-weight: 700;
            color: #3b82f6;
            letter-spacing: -0.5px;
          }

          .page-header-brand span { color: #94a3b8; }

          .page-header-meta {
            font-size: 8pt;
            color: #94a3b8;
          }

          h2 {
            font-size: 15pt;
            font-weight: 700;
            color: #1e293b;
            margin: 28px 0 16px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid #e2e8f0;
            page-break-after: avoid;
            display: flex;
            align-items: center;
            gap: 8px;
          }

          h3 {
            font-size: 11pt;
            font-weight: 600;
            color: #334155;
            margin: 16px 0 8px 0;
          }

          /* ── Score Section ──────────────────────────────── */

          .score-section {
            display: flex;
            gap: 30px;
            margin-bottom: 30px;
            page-break-inside: avoid;
          }

          .score-charts {
            flex: 1;
          }

          .chart-container {
            display: flex;
            justify-content: center;
            margin: 20px 0;
          }

          /* ── Executive Summary ──────────────────────────── */

          .exec-summary {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0 30px;
            page-break-inside: avoid;
          }

          .exec-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 16px;
            margin-top: 12px;
          }

          .exec-card {
            padding: 12px;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            background: white;
          }

          .exec-card-title {
            font-size: 8pt;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 6px;
          }

          .exec-card-title.green { color: #16a34a; }
          .exec-card-title.amber { color: #d97706; }
          .exec-card-title.blue { color: #2563eb; }

          .exec-card ul {
            list-style: none;
            padding: 0;
          }

          .exec-card li {
            font-size: 9pt;
            color: #475569;
            padding: 2px 0;
            border-bottom: 1px solid #f1f5f9;
          }

          .exec-card li:last-child { border-bottom: none; }

          /* ── Content Sections ───────────────────────────── */

          .section {
            page-break-inside: avoid;
            margin-bottom: 24px;
          }

          ul {
            padding-left: 18px;
          }

          li {
            margin-bottom: 5px;
            color: #475569;
          }

          .improvement-item {
            padding: 12px 14px;
            background: #f8fafc;
            border-left: 4px solid #3b82f6;
            border-radius: 0 6px 6px 0;
            margin-bottom: 8px;
            page-break-inside: avoid;
          }

          .improvement-title {
            font-weight: 600;
            color: #1e293b;
            font-size: 10pt;
            margin-bottom: 3px;
          }

          .improvement-desc {
            font-size: 9pt;
            color: #64748b;
            margin-top: 3px;
          }

          .improvement-meta {
            font-size: 8pt;
            color: #94a3b8;
            margin-top: 4px;
            display: flex;
            gap: 12px;
          }

          .impact-high { border-left-color: #ef4444; }
          .impact-medium { border-left-color: #f59e0b; }
          .impact-low { border-left-color: #22c55e; }

          /* ── Data Source Note ────────────────────────────── */

          .data-note {
            font-size: 8pt;
            color: #64748b;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 6px;
            padding: 10px 14px;
            margin: 16px 0 20px;
          }

          .data-note strong { color: #475569; }

          /* ── Budget Box ─────────────────────────────────── */

          .budget-grid {
            display: flex;
            gap: 16px;
            margin-top: 12px;
          }

          .budget-card {
            flex: 1;
            padding: 16px;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-radius: 8px;
            text-align: center;
          }

          .budget-range {
            font-size: 14pt;
            font-weight: 700;
            color: #16a34a;
          }

          .budget-label {
            font-size: 8pt;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-top: 4px;
          }

          /* ── Footer ─────────────────────────────────────── */

          .report-footer {
            margin-top: 40px;
            padding-top: 16px;
            border-top: 1px solid #e2e8f0;
            font-size: 8pt;
            color: #94a3b8;
            text-align: center;
          }

          .report-footer strong { color: #3b82f6; }

          /* ── Print adjustments ──────────────────────────── */

          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .cover::before { background: #3b82f6 !important; }
            .improvement-item { background: #f8fafc !important; }
            .exec-summary { background: #f8fafc !important; }
            .budget-card { background: #f0fdf4 !important; }
          }
        </style>
      </head>
      <body>
        <!-- ═══ COVER PAGE ═══ -->
        <div class="cover">
          <div class="cover-logo">sajt<span>maskin</span></div>

          <div class="cover-score">
            ${scoreCircle}
          </div>

          <h1 class="cover-title">Webbplatsanalys</h1>
          <p class="cover-domain">${safeCompanyOrDomain}</p>

          <div class="cover-meta">
            <div class="cover-meta-item">
              <span class="cover-meta-label">Datum</span>
              <span>${dateStr}</span>
            </div>
            <div class="cover-meta-item">
              <span class="cover-meta-label">Analys</span>
              <span>${escapeHtml(auditModeLabel)}</span>
            </div>
            <div class="cover-meta-item">
              <span class="cover-meta-label">Doman</span>
              <span>${safeDomain}</span>
            </div>
            ${faviconUrl ? `<div class="cover-meta-item"><img src="${faviconUrl}" width="20" height="20" style="border-radius:4px" alt=""></div>` : ""}
          </div>
        </div>

        <!-- ═══ EXECUTIVE SUMMARY ═══ -->
        <div class="page-header">
          <div class="page-header-brand">sajt<span>maskin</span></div>
          <div class="page-header-meta">${safeDomain} | ${dateStr}</div>
        </div>

        <h2>${SVG_ICONS.bulb} Sammanfattning</h2>

        <div class="exec-summary">
          <p style="font-size: 11pt; color: #334155; margin-bottom: 4px;">
            <strong>${safeCompanyOrDomain}</strong> fick ett totalbetyg pa
            <strong style="color: ${avgScore >= 80 ? "#16a34a" : avgScore >= 60 ? "#d97706" : "#ef4444"}">${avgScore}/100</strong>
            (${avgScore >= 80 ? "Bra" : avgScore >= 60 ? "Godkant" : "Behover forbattring"}).
          </p>

          <div class="exec-grid">
            <div class="exec-card">
              <div class="exec-card-title green">${SVG_ICONS.check} Styrkor</div>
              <ul>
                ${topStrengths.length ? topStrengths.map((s) => `<li>${escapeHtml(s)}</li>`).join("") : "<li>Inga specifika styrkor identifierade</li>"}
              </ul>
            </div>
            <div class="exec-card">
              <div class="exec-card-title amber">${SVG_ICONS.warning} Problem</div>
              <ul>
                ${topIssues.length ? topIssues.map((s) => `<li>${escapeHtml(s)}</li>`).join("") : "<li>Inga kritiska problem hittade</li>"}
              </ul>
            </div>
            <div class="exec-card">
              <div class="exec-card-title blue">${SVG_ICONS.bulb} Forbattringar</div>
              <ul>
                ${topImprovements.length ? topImprovements.map((imp) => `<li>${escapeHtml(imp.item)}</li>`).join("") : "<li>Inga direkta forbattringar foreslagna</li>"}
              </ul>
            </div>
          </div>
        </div>

        ${scrape ? `
          <div class="data-note">
            <strong>Datakalla:</strong>
            ${escapeHtml(`${scrape.pages_sampled} sida(or), ${wordCountLabel}, ${scrape.headings_count} rubriker, ${scrape.images_count} bilder.`)}
            ${scrape.is_js_rendered ? "<br><strong>Obs:</strong> JavaScript-rendering detekterad." : ""}
          </div>
        ` : ""}

        <!-- ═══ SCORE CHARTS ═══ -->
        <h2>Betyg per kategori</h2>

        <div class="score-section">
          <div class="chart-container">
            ${radarChart}
          </div>
        </div>

        <div class="chart-container">
          ${barChart}
        </div>

        <!-- ═══ STRENGTHS ═══ -->
        ${result.strengths?.length ? `
          <div class="section">
            <h2>${SVG_ICONS.check} Styrkor</h2>
            <ul>
              ${result.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}

        <!-- ═══ ISSUES ═══ -->
        ${result.issues?.length ? `
          <div class="section">
            <h2>${SVG_ICONS.warning} Problem att atgarda</h2>
            <ul>
              ${result.issues.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}
            </ul>
          </div>
        ` : ""}

        <!-- ═══ IMPROVEMENTS ═══ -->
        ${result.improvements?.length ? `
          <div class="section">
            <h2>${SVG_ICONS.bulb} Forbattringsforslag</h2>
            ${result.improvements.slice(0, 10).map((imp) => `
              <div class="improvement-item impact-${imp.impact || "medium"}">
                <div class="improvement-title">${escapeHtml(imp.item)}</div>
                ${imp.why ? `<div class="improvement-desc">${escapeHtml(imp.why)}</div>` : ""}
                <div class="improvement-meta">
                  <span>Paverkan: ${formatImpact(imp.impact)}</span>
                  <span>Insats: ${formatEffort(imp.effort)}</span>
                  ${imp.estimated_time ? `<span>Tid: ${escapeHtml(imp.estimated_time)}</span>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
        ` : ""}

        <!-- ═══ TECHNICAL RECOMMENDATIONS ═══ -->
        ${result.technical_recommendations?.length ? `
          <div class="section">
            <h2>${SVG_ICONS.gear} Tekniska rekommendationer</h2>
            ${result.technical_recommendations.slice(0, 8).map((rec) => `
              <div class="improvement-item impact-medium">
                <div class="improvement-title">${escapeHtml(rec.area)}</div>
                <div class="improvement-desc"><strong>Nulage:</strong> ${escapeHtml(rec.current_state)}</div>
                <div class="improvement-desc"><strong>Rekommendation:</strong> ${escapeHtml(rec.recommendation)}</div>
                ${rec.implementation ? `<div class="improvement-desc"><strong>Implementation:</strong> ${escapeHtml(rec.implementation)}</div>` : ""}
              </div>
            `).join("")}
          </div>
        ` : ""}

        <!-- ═══ COMPETITOR INSIGHTS ═══ -->
        ${result.competitor_insights ? `
          <div class="section">
            <h2>${SVG_ICONS.trophy} Konkurrent- och branschinsikter</h2>
            <ul>
              <li><strong>Branschstandard:</strong> ${safeText(result.competitor_insights.industry_standards)}</li>
              <li><strong>Saknade funktioner:</strong> ${safeText(result.competitor_insights.missing_features)}</li>
              <li><strong>Unika styrkor:</strong> ${safeText(result.competitor_insights.unique_strengths)}</li>
            </ul>
          </div>
        ` : ""}

        <!-- ═══ ADVANCED: Business Profile ═══ -->
        ${result.audit_mode === "advanced" && result.business_profile ? `
          <div class="section">
            <h2>Affarsprofil</h2>
            <ul>
              <li><strong>Bransch:</strong> ${safeText(result.business_profile.industry)}</li>
              <li><strong>Foretagsstorlek:</strong> ${safeText(result.business_profile.company_size)}</li>
              <li><strong>Affarsmodell:</strong> ${safeText(result.business_profile.business_model)}</li>
              <li><strong>Mognadsgrad:</strong> ${safeText(result.business_profile.maturity)}</li>
              <li><strong>Karnerbjudanden:</strong> ${renderInlineList(result.business_profile.core_offers)}</li>
              <li><strong>Intaktsstrommar:</strong> ${renderInlineList(result.business_profile.revenue_streams)}</li>
            </ul>
          </div>
        ` : ""}

        <!-- ═══ ADVANCED: Market Context ═══ -->
        ${result.audit_mode === "advanced" && result.market_context ? `
          <div class="section">
            <h2>Marknad och geografi</h2>
            <ul>
              <li><strong>Primar geografi:</strong> ${safeText(result.market_context.primary_geography)}</li>
              <li><strong>Serviceomrade:</strong> ${safeText(result.market_context.service_area)}</li>
              <li><strong>Konkurrensniva:</strong> ${safeText(result.market_context.competition_level)}</li>
              <li><strong>Nyckelkonkurrenter:</strong> ${renderInlineList(result.market_context.key_competitors)}</li>
            </ul>
          </div>
        ` : ""}

        <!-- ═══ ADVANCED: Customer Segments ═══ -->
        ${result.audit_mode === "advanced" && result.customer_segments ? `
          <div class="section">
            <h2>Kundsegment</h2>
            <ul>
              <li><strong>Primar kundgrupp:</strong> ${safeText(result.customer_segments.primary_segment)}</li>
              <li><strong>Sekundara kundgrupper:</strong> ${renderInlineList(result.customer_segments.secondary_segments)}</li>
              <li><strong>Kundbehov:</strong> ${renderInlineList(result.customer_segments.customer_needs)}</li>
              <li><strong>Beslutstriggers:</strong> ${renderInlineList(result.customer_segments.decision_triggers)}</li>
            </ul>
          </div>
        ` : ""}

        <!-- ═══ ADVANCED: Competitive Landscape ═══ -->
        ${result.audit_mode === "advanced" && result.competitive_landscape ? `
          <div class="section">
            <h2>Konkurrenslandskap</h2>
            <ul>
              <li><strong>Positionering:</strong> ${safeText(result.competitive_landscape.positioning)}</li>
              <li><strong>Differentiering:</strong> ${safeText(result.competitive_landscape.differentiation)}</li>
              <li><strong>Prisposition:</strong> ${safeText(result.competitive_landscape.price_positioning)}</li>
              <li><strong>Mojligheter:</strong> ${renderInlineList(result.competitive_landscape.opportunities)}</li>
            </ul>
          </div>
        ` : ""}

        <!-- ═══ SECURITY ═══ -->
        ${result.security_analysis ? `
          <div class="section">
            <h2>${SVG_ICONS.shield} Sakerhetsanalys</h2>
            <ul>
              <li><strong>HTTPS:</strong> ${escapeHtml(result.security_analysis.https_status)}</li>
              <li><strong>Sakerhetshuvuden:</strong> ${escapeHtml(result.security_analysis.headers_analysis)}</li>
              <li><strong>Cookie-policy:</strong> ${escapeHtml(result.security_analysis.cookie_policy)}</li>
            </ul>
          </div>
        ` : ""}

        <!-- ═══ BUDGET ═══ -->
        ${result.budget_estimate ? `
          <div class="section">
            <h2>${SVG_ICONS.money} Budgetuppskattning</h2>
            <div class="budget-grid">
              ${result.budget_estimate.immediate_fixes ? `
                <div class="budget-card">
                  <div class="budget-range">
                    ${formatCurrency(result.budget_estimate.immediate_fixes.low)} -
                    ${formatCurrency(result.budget_estimate.immediate_fixes.high)}
                  </div>
                  <div class="budget-label">Omedelbara atgarder</div>
                </div>
              ` : ""}
              ${result.budget_estimate.full_optimization ? `
                <div class="budget-card">
                  <div class="budget-range">
                    ${formatCurrency(result.budget_estimate.full_optimization.low)} -
                    ${formatCurrency(result.budget_estimate.full_optimization.high)}
                  </div>
                  <div class="budget-label">Full optimering</div>
                </div>
              ` : ""}
            </div>
          </div>
        ` : ""}

        <!-- ═══ FOOTER ═══ -->
        <div class="report-footer">
          <p>
            Denna rapport ar genererad av <strong>sajtmaskin</strong> -
            AI-driven webbplatsanalys och utveckling
          </p>
          <p style="margin-top: 4px;">
            &copy; ${new Date().getFullYear()} sajtmaskin.se &bull; Rapporten ar konfidentiell
          </p>
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();

    try {
      printWindow.focus();
      printWindow.onafterprint = () => {
        try {
          printWindow.close();
        } catch {
          // ignore
        }
      };
    } catch {
      // ignore
    }

    try {
      printWindow.print();
    } catch {
      // ignore
    }

    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
      } catch {
        // ignore
      }
    }, 350);
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-6 text-center">
        <div className="mb-4 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-teal/20">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-brand-teal"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white">Generera PDF-rapport</h3>
        </div>
        <p className="mb-6 text-sm text-gray-400">
          En professionell rapport med diagram och analys oppnas i ett nytt fonster.
          Valj &quot;Spara som PDF&quot; i utskriftsdialogen.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-gray-800 px-4 py-3 text-gray-300 transition-colors hover:bg-gray-700"
          >
            Avbryt
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 rounded-lg bg-brand-teal px-4 py-3 font-medium text-white transition-colors hover:bg-brand-teal/90"
          >
            Oppna rapport
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helper functions ──────────────────────────────────────────────

function calculateAvgScore(scores: Record<string, number | undefined>): number {
  const values = Object.values(scores).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function formatImpact(impact?: string): string {
  const labels: Record<string, string> = { high: "Hog", medium: "Medel", low: "Lag" };
  return labels[impact || "medium"] || "Medel";
}

function formatEffort(effort?: string): string {
  const labels: Record<string, string> = { low: "Lag", medium: "Medel", high: "Hog" };
  return labels[effort || "medium"] || "Medel";
}

function formatCurrency(amount?: number): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(amount);
}

function normalizeReportText(input?: string): string {
  if (!input) return "";
  let cleaned = input.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  cleaned = cleaned.replace(/\r\n/g, "\n");
  cleaned = cleaned.replace(/[ \t]+\n/g, "\n");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeText(input?: string): string {
  return escapeHtml(normalizeReportText(input));
}

function renderInlineList(items?: string[]): string {
  if (!items || items.length === 0) return "-";
  return items.map((item) => safeText(item)).join(", ");
}
