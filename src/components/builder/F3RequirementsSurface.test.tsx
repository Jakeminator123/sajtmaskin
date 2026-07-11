import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { F3RequirementsSurface } from "./F3RequirementsSurface";

afterEach(() => {
  vi.unstubAllGlobals();
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
        chatId="chat_1"
        versionId="ver_design"
        missingByIntegration={missingByIntegration}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByRole("region", { name: /krav för integrationsbygge/i })).toBeTruthy();
    expect(screen.getByText("Stripe")).toBeTruthy();
    expect(screen.getByText("Resend")).toBeTruthy();
    expect(screen.getByLabelText("STRIPE_SECRET_KEY")).toBeTruthy();
    expect(screen.getByLabelText("RESEND_API_KEY")).toBeTruthy();
    expect(screen.queryByText("EXTRA_KEY")).toBeNull();
  });

  it("saves only entered server-provided keys through the project env-vars API", async () => {
    const fetchMock = vi.fn(async () => Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <F3RequirementsSurface
        projectId="project_1"
        chatId="chat_1"
        versionId="ver_design"
        missingByIntegration={missingByIntegration}
        onRetry={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("STRIPE_SECRET_KEY"), {
      target: { value: "secret-value" },
    });
    fireEvent.click(screen.getByRole("button", { name: /spara 1 nyckel/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/v0/projects/project_1/env-vars",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            vars: [{ key: "STRIPE_SECRET_KEY", value: "secret-value", sensitive: true }],
            upsert: true,
          }),
        }),
      );
    });
  });

  it("offers an explicit retry without closing the persistent surface", () => {
    const onRetry = vi.fn();
    render(
      <F3RequirementsSurface
        projectId="project_1"
        chatId="chat_1"
        versionId="ver_design"
        missingByIntegration={missingByIntegration}
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /fortsätt integrationsbygget/i }));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByRole("region", { name: /krav för integrationsbygge/i })).toBeTruthy();
  });
});
