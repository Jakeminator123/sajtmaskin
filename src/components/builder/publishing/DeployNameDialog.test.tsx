import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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

    expect(screen.getByText(/\d+ credits för publicering/)).toBeTruthy();
    expect(screen.queryByText(/credits\/månad/i)).toBeNull();
    expect(screen.queryByText(/Hosting/)).toBeNull();
  });
});
