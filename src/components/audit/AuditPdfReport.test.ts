import { describe, expect, it } from "vitest";
import { generateBarChartSVG, generateRadarChartSVG } from "./AuditPdfReport";

// U#14/U#73: the audit PDF embeds score-category keys into inline SVG <text>.
// Unknown keys (no LABELS entry) previously injected the raw key, allowing
// markup/script injection into the print-window document. These now escape.

describe("audit PDF SVG escaping (U#14/U#73)", () => {
  const malicious = '</text><script>alert(1)</script>';

  it("escapes unknown category keys in the bar chart", () => {
    const svg = generateBarChartSVG({ [malicious]: 50 });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("escapes unknown category keys in the radar chart", () => {
    const svg = generateRadarChartSVG({ [malicious]: 50, seo: 60, ux: 70 });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("still renders known labels normally", () => {
    const svg = generateBarChartSVG({ seo: 80 });
    expect(svg).toContain(">SEO</text>");
  });
});
