"use client";

import { useRef } from "react";
import type { AuditResult } from "@/types/audit";

interface AuditPdfReportProps {
  result: AuditResult;
  onClose: () => void;
}

/**
 * Print-optimized audit report component
 * Opens in a new window for PDF generation via browser print
 */
export function AuditPdfReport({ result, onClose }: AuditPdfReportProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    // Open new window with print content
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Tillåt popup-fönster för att generera PDF");
      return;
    }

    const scores = result.audit_scores || {};
    const avgScore = calculateAvgScore(scores);

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="sv">
      <head>
        <meta charset="UTF-8">
        <title>Webbplatsanalys - ${result.domain || "Rapport"}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          @page {
            size: A4;
            margin: 20mm;
          }
          
          body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            font-size: 11pt;
            line-height: 1.5;
            color: #1a1a1a;
            background: white;
          }
          
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-bottom: 20px;
            border-bottom: 3px solid #0d9488;
            margin-bottom: 30px;
          }
          
          .logo {
            font-size: 24pt;
            font-weight: 800;
            color: #0d9488;
            letter-spacing: -1px;
          }
          
          .logo span {
            color: #1a1a1a;
          }
          
          .report-meta {
            text-align: right;
            font-size: 9pt;
            color: #666;
          }
          
          .report-title {
            font-size: 22pt;
            font-weight: 700;
            color: #1a1a1a;
            margin-bottom: 8px;
          }
          
          .report-subtitle {
            font-size: 14pt;
            color: #0d9488;
            margin-bottom: 30px;
          }
          
          .score-summary {
            display: flex;
            gap: 20px;
            margin-bottom: 40px;
            page-break-inside: avoid;
          }
          
          .main-score {
            width: 140px;
            height: 140px;
            border-radius: 50%;
            background: linear-gradient(135deg, #0d9488, #14b8a6);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: white;
          }
          
          .main-score-value {
            font-size: 42pt;
            font-weight: 800;
            line-height: 1;
          }
          
          .main-score-label {
            font-size: 9pt;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.9;
          }
          
          .score-grid {
            flex: 1;
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 10px;
          }
          
          .score-item {
            text-align: center;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 8px;
          }
          
          .score-item-value {
            font-size: 18pt;
            font-weight: 700;
            color: #0d9488;
          }
          
          .score-item-label {
            font-size: 8pt;
            color: #666;
            text-transform: uppercase;
          }
          
          h2 {
            font-size: 14pt;
            font-weight: 700;
            color: #1a1a1a;
            margin: 30px 0 15px 0;
            padding-bottom: 8px;
            border-bottom: 2px solid #e5e7eb;
            page-break-after: avoid;
          }
          
          h3 {
            font-size: 11pt;
            font-weight: 600;
            color: #374151;
            margin: 20px 0 10px 0;
          }
          
          .section {
            page-break-inside: avoid;
            margin-bottom: 25px;
          }
          
          ul {
            padding-left: 20px;
          }
          
          li {
            margin-bottom: 6px;
          }
          
          .improvement-item {
            padding: 12px;
            background: #f8f9fa;
            border-left: 4px solid #0d9488;
            margin-bottom: 10px;
            page-break-inside: avoid;
          }
          
          .improvement-title {
            font-weight: 600;
            color: #1a1a1a;
            margin-bottom: 4px;
          }
          
          .improvement-meta {
            font-size: 9pt;
            color: #666;
          }
          
          .impact-high { border-left-color: #ef4444; }
          .impact-medium { border-left-color: #f59e0b; }
          .impact-low { border-left-color: #22c55e; }
          
          .budget-box {
            display: flex;
            gap: 20px;
            margin-top: 15px;
          }
          
          .budget-item {
            flex: 1;
            padding: 15px;
            background: #f0fdfa;
            border-radius: 8px;
            text-align: center;
          }
          
          .budget-range {
            font-size: 16pt;
            font-weight: 700;
            color: #0d9488;
          }
          
          .budget-label {
            font-size: 9pt;
            color: #666;
          }
          
          .footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
            font-size: 9pt;
            color: #666;
            text-align: center;
          }
          
          .footer-logo {
            font-weight: 700;
            color: #0d9488;
          }
          
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .main-score { background: #0d9488 !important; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="logo">sajt<span>maskin</span></div>
          <div class="report-meta">
            Genererad: ${new Date().toLocaleDateString("sv-SE")}<br>
            ${result.domain || ""}
          </div>
        </div>
        
        <h1 class="report-title">Webbplatsanalys</h1>
        <p class="report-subtitle">${
          result.company || result.domain || "Analyserad webbplats"
        }</p>
        
        <div class="score-summary">
          <div class="main-score">
            <div class="main-score-value">${avgScore}</div>
            <div class="main-score-label">Total poäng</div>
          </div>
          <div class="score-grid">
            ${Object.entries(scores)
              .filter(([, v]) => typeof v === "number")
              .slice(0, 8)
              .map(
                ([key, value]) => `
              <div class="score-item">
                <div class="score-item-value">${value}</div>
                <div class="score-item-label">${formatScoreLabel(key)}</div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
        
        ${
          result.strengths && result.strengths.length > 0
            ? `
          <div class="section">
            <h2>✅ Styrkor</h2>
            <ul>
              ${result.strengths.map((s) => `<li>${s}</li>`).join("")}
            </ul>
          </div>
        `
            : ""
        }
        
        ${
          result.issues && result.issues.length > 0
            ? `
          <div class="section">
            <h2>⚠️ Problem att åtgärda</h2>
            <ul>
              ${result.issues.map((s) => `<li>${s}</li>`).join("")}
            </ul>
          </div>
        `
            : ""
        }
        
        ${
          result.improvements && result.improvements.length > 0
            ? `
          <div class="section">
            <h2>💡 Förbättringsförslag</h2>
            ${result.improvements
              .slice(0, 10)
              .map(
                (imp) => `
              <div class="improvement-item impact-${imp.impact || "medium"}">
                <div class="improvement-title">${imp.item}</div>
                ${
                  imp.why
                    ? `<p style="font-size: 10pt; color: #555; margin-top: 4px;">${imp.why}</p>`
                    : ""
                }
                <div class="improvement-meta">
                  Påverkan: ${formatImpact(imp.impact)} • 
                  Arbetsinsats: ${formatEffort(imp.effort)}
                  ${imp.estimated_time ? ` • Tid: ${imp.estimated_time}` : ""}
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        `
            : ""
        }
        
        ${
          result.security_analysis
            ? `
          <div class="section">
            <h2>🔒 Säkerhetsanalys</h2>
            <ul>
              <li><strong>HTTPS:</strong> ${result.security_analysis.https_status}</li>
              <li><strong>Säkerhetshuvuden:</strong> ${result.security_analysis.headers_analysis}</li>
              <li><strong>Cookie-policy:</strong> ${result.security_analysis.cookie_policy}</li>
            </ul>
          </div>
        `
            : ""
        }
        
        ${
          result.budget_estimate
            ? `
          <div class="section">
            <h2>💰 Budgetuppskattning</h2>
            <div class="budget-box">
              ${
                result.budget_estimate.immediate_fixes
                  ? `
                <div class="budget-item">
                  <div class="budget-range">
                    ${formatCurrency(
                      result.budget_estimate.immediate_fixes.low
                    )} - 
                    ${formatCurrency(
                      result.budget_estimate.immediate_fixes.high
                    )}
                  </div>
                  <div class="budget-label">Omedelbara åtgärder</div>
                </div>
              `
                  : ""
              }
              ${
                result.budget_estimate.full_optimization
                  ? `
                <div class="budget-item">
                  <div class="budget-range">
                    ${formatCurrency(
                      result.budget_estimate.full_optimization.low
                    )} - 
                    ${formatCurrency(
                      result.budget_estimate.full_optimization.high
                    )}
                  </div>
                  <div class="budget-label">Full optimering</div>
                </div>
              `
                  : ""
              }
            </div>
          </div>
        `
            : ""
        }
        
        <div class="footer">
          <p>
            Denna rapport är genererad av <span class="footer-logo">sajtmaskin</span> – 
            AI-driven webbplatsanalys och utveckling
          </p>
          <p style="margin-top: 5px;">
            © ${new Date().getFullYear()} sajtmaskin.se • Rapporten är konfidentiell
          </p>
        </div>
      </body>
      </html>
    `);

    printWindow.document.close();

    // Wait for content to load, then print
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 250);
    };
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 max-w-md w-full p-6 text-center">
        <h3 className="text-xl font-bold text-white mb-4">
          📄 Generera PDF-rapport
        </h3>
        <p className="text-gray-400 mb-6">
          En snygg rapport med sajtmaskins logga öppnas i ett nytt fönster. Välj
          &quot;Spara som PDF&quot; i utskriftsdialogen.
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 py-3 px-4 bg-teal-600 hover:bg-teal-500 text-white font-medium transition-colors"
          >
            Öppna rapport
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper functions
function calculateAvgScore(scores: Record<string, number | undefined>): number {
  const values = Object.values(scores).filter(
    (v): v is number => typeof v === "number"
  );
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function formatScoreLabel(key: string): string {
  const labels: Record<string, string> = {
    seo: "SEO",
    technical_seo: "Teknisk SEO",
    ux: "UX",
    content: "Innehåll",
    performance: "Prestanda",
    accessibility: "Tillgänglighet",
    security: "Säkerhet",
    mobile: "Mobil",
  };
  return labels[key] || key;
}

function formatImpact(impact?: string): string {
  const labels: Record<string, string> = {
    high: "Hög",
    medium: "Medel",
    low: "Låg",
  };
  return labels[impact || "medium"] || "Medel";
}

function formatEffort(effort?: string): string {
  const labels: Record<string, string> = {
    low: "Låg",
    medium: "Medel",
    high: "Hög",
  };
  return labels[effort || "medium"] || "Medel";
}

function formatCurrency(amount?: number): string {
  if (!amount) return "–";
  return new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(amount);
}
