import { createElement } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AnalysTool, publicAnalysErrorMessage } from "./analys-tool";

describe("publicAnalysErrorMessage", () => {
  it("describes the daily calendar quota only for its explicit code", () => {
    const message = publicAnalysErrorMessage({
      status: 429,
      code: "public_analys_daily_quota_exhausted",
      fallback: "server fallback",
    });

    expect(message).toContain("i dag");
    expect(message).not.toContain("24 timmar");
  });

  it("keeps an in-progress reservation distinct from spent daily quota", () => {
    expect(
      publicAnalysErrorMessage({
        status: 429,
        code: "public_analys_in_progress",
        fallback: "server fallback",
      }),
    ).toBe("En analys behandlas redan från den här uppkopplingen. Vänta tills den är klar.");
  });

  it("maps the short attempt guard to a retry message", () => {
    expect(
      publicAnalysErrorMessage({
        status: 429,
        code: "public_analys_attempt_rate_limited",
        fallback: "server fallback",
      }),
    ).toBe("För många analysförsök på kort tid. Vänta en stund och försök igen.");
  });

  it("never infers daily quota from an unknown 429", () => {
    expect(
      publicAnalysErrorMessage({
        status: 429,
        code: "future_rate_limit",
        fallback: "En ny servertext",
      }),
    ).toBe("En ny servertext");
  });
});

describe("AnalysTool report preservation", () => {
  it("keeps the previous report and URL on failure, then replaces both on success", async () => {
    const onAnalysisSuccess = vi.fn();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, report: { company: "Rapport A", audit_scores: {} } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: false, error: "Tillfälligt fel" }), {
          status: 500,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, report: { company: "Rapport C", audit_scores: {} } }),
        ),
      );
    render(
      createElement(AnalysTool, {
        onPdf: vi.fn(),
        onBuild: vi.fn(),
        onAnalysisSuccess,
      }),
    );
    const input = screen.getByLabelText("Webbplatsadress");

    fireEvent.change(input, { target: { value: "a.example.se" } });
    fireEvent.click(screen.getByRole("button", { name: /Analysera sajten/ }));
    await screen.findByText("Rapport A");
    expect(onAnalysisSuccess).toHaveBeenLastCalledWith({
      report: { company: "Rapport A", audit_scores: {} },
      auditedUrl: "a.example.se",
    });
    expect(screen.queryByText("a.example.se")).not.toBeNull();

    fireEvent.change(input, { target: { value: "b.example.se" } });
    fireEvent.click(screen.getByRole("button", { name: /Analysera sajten/ }));
    await screen.findByRole("alert");
    expect(screen.queryByText("Rapport A")).not.toBeNull();
    expect(screen.queryByText("a.example.se")).not.toBeNull();
    expect(onAnalysisSuccess).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "c.example.se" } });
    fireEvent.click(screen.getByRole("button", { name: /Analysera sajten/ }));
    await waitFor(() => expect(screen.queryByText("Rapport C")).not.toBeNull());
    expect(screen.queryByText("c.example.se")).not.toBeNull();
    expect(screen.queryByText("Rapport A")).toBeNull();
    expect(onAnalysisSuccess).toHaveBeenLastCalledWith({
      report: { company: "Rapport C", audit_scores: {} },
      auditedUrl: "c.example.se",
    });
    expect(onAnalysisSuccess).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.restoreAllMocks();
  });
});
