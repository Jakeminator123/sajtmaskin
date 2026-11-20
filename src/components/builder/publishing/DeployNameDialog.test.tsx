import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CREDIT_ACTION_PRICES } from "@/lib/credits/pricing";
import { DeployNameDialog } from "./DeployNameDialog";

describe("DeployNameDialog", () => {
  it("shows the one-time publish cost and does not promise a monthly hosting fee", () => {
    render(
      <DeployNameDialog
        open
        deployName="demo"
        deployNameError={null}
        isDeploying={false}
        isSaving={false}
        onDeployNameChange={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        `${DEFAULT_CREDIT_ACTION_PRICES.deployProduction} credits för publicering`,
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/credits\/månad/i)).toBeNull();
    expect(screen.queryByText(/Hosting/)).toBeNull();
  });

  it("shows the address a first publish creates", async () => {
    render(
      <DeployNameDialog
        open
        deployName="Frisör i Malmö"
        deployNameError={null}
        isDeploying={false}
        isSaving={false}
        projectId="project_a"
        onDeployNameChange={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const preview = await waitFor(() => screen.getByTestId("deploy-address-preview"));
    expect(preview.textContent).toMatch(/sajtmaskin-frisor-i-malmo-[0-9a-f]{8}\.vercel\.app/);
  });

  it("keeps the existing address on a re-publish", () => {
    render(
      <DeployNameDialog
        open
        deployName="Nytt namn"
        deployNameError={null}
        isDeploying={false}
        isSaving={false}
        projectId="project_a"
        existingHostingName="sajtmaskin-frisor-ab12cd34"
        onDeployNameChange={vi.fn()}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByTestId("deploy-address-preview").textContent).toContain(
      "Adressen är kvar: sajtmaskin-frisor-ab12cd34.vercel.app",
    );
  });
});
