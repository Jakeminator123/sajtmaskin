import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditPdfReport } from "./AuditPdfReport";
import { generatePublicAnalysPdfHtml } from "@/lib/audit/public-analys-pdf";

const malicious = '</div><script>alert("x")</script>';
const publicReport = {
  company: malicious,
  domain: "example.se",
  audit_scores: { seo: 70, ux: 60 },
  issues: [malicious],
  strengths: [malicious],
  improvements: [
    {
      item: malicious,
      impact: "high" as const,
      effort: "low" as const,
      why: malicious,
      how: malicious,
    },
  ],
  seo: { foundation: malicious, key_pages: [malicious] },
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("public analysis PDF", () => {
  it("escapes every public report field in its standalone HTML", () => {
    const html = generatePublicAnalysPdfHtml(publicReport, `https://example.se/${malicious}`);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("site_content");
    expect(html).not.toContain("template_data");
  });

  it("opens and prints only after the user clicks the dialog action", () => {
    vi.useFakeTimers();
    const write = vi.fn();
    const print = vi.fn();
    const printWindow = {
      document: { write, close: vi.fn() },
      focus: vi.fn(),
      print,
      close: vi.fn(),
      onafterprint: null,
    };
    const open = vi
      .spyOn(window, "open")
      .mockReturnValue(printWindow as unknown as Window & typeof globalThis);

    render(
      <AuditPdfReport
        publicReport={publicReport}
        auditedUrl="https://example.se"
        onClose={vi.fn()}
      />,
    );

    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Oppna rapport" }));

    expect(open).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith(expect.stringContaining("Webbplatsanalys"));
    expect(print).toHaveBeenCalledTimes(1);
  });
});
