import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { F3RequirementsSurface, F3StatusSurface } from "./F3RequirementsSurface";

vi.mock("@/lib/builder/project-env-events", () => ({
  openDossiersPanel: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("F3RequirementsSurface", () => {
  const missingByIntegration = [
    {
      key: "stripe",
      name: "Stripe",
      missing: ["STRIPE_SECRET_KEY"],
    },
    {
      key: "resend",
      name: "Resend",
      missing: ["RESEND_API_KEY"],
    },
  ];

  it("renders exactly the server-provided integration names and missing keys", () => {
    render(
      <F3RequirementsSurface
        projectId="project_1"
        missingByIntegration={missingByIntegration}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: /krav för integrationsbygge/i })).toBeTruthy();
    expect(screen.getByText("Stripe")).toBeTruthy();
    expect(screen.getByText("Resend")).toBeTruthy();
    expect(screen.getByText("STRIPE_SECRET_KEY")).toBeTruthy();
    expect(screen.getByText("RESEND_API_KEY")).toBeTruthy();
    expect(screen.queryByText("EXTRA_KEY")).toBeNull();
  });

  it("deep-links to Byggblock instead of running a second env editor (R4)", async () => {
    const { openDossiersPanel } = await import("@/lib/builder/project-env-events");
    const fetchMock = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <F3RequirementsSurface
        projectId="project_1"
        missingByIntegration={missingByIntegration}
        onRetry={vi.fn()}
      />,
    );

    // No inputs of its own — Byggblock owns env entry.
    expect(screen.queryByLabelText("STRIPE_SECRET_KEY")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /öppna byggblock/i }));

    expect(openDossiersPanel).toHaveBeenCalledWith(["STRIPE_SECRET_KEY", "RESEND_API_KEY"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers an explicit retry without closing the persistent surface", () => {
    const onRetry = vi.fn();
    render(
      <F3RequirementsSurface
        projectId="project_1"
        missingByIntegration={missingByIntegration}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /fortsätt integrationsbygget/i }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: /krav för integrationsbygge/i })).toBeTruthy();
  });
});

describe("F3StatusSurface", () => {
  const failedStatus = {
    tone: "error" as const,
    title: "ReleaseGate behöver åtgärdas",
    description: "Underkända kontroller: lint.",
  };

  it("keeps the verdict visible but as a discrete line with a diagnostics link (R1)", () => {
    render(<F3StatusSurface status={failedStatus} chatId="chat_1" versionId="ver_1" />);

    const row = screen.getByRole("status", { name: /status för integrationsbygge/i });
    expect(row.textContent).toContain("ReleaseGate behöver åtgärdas");
    // No banner box — the row carries no alert border/background.
    expect(row.className).not.toContain("border");
    expect(screen.getByRole("button", { name: /visa diagnostik/i })).toBeTruthy();
  });

  it("omits the diagnostics link when there is no version to diagnose", () => {
    render(<F3StatusSurface status={failedStatus} chatId="chat_1" versionId={null} />);

    expect(screen.queryByRole("button", { name: /visa diagnostik/i })).toBeNull();
    expect(
      screen.getByRole("status", { name: /status för integrationsbygge/i }).textContent,
    ).toContain("ReleaseGate behöver åtgärdas");
  });
});
