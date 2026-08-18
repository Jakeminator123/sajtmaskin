import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DossierCatalogEntry } from "@/lib/builder/dossier-catalog";
import { DossierCatalogStagingView } from "./DossierCatalogStagingView";

const stripeEntry: DossierCatalogEntry = {
  id: "stripe-checkout",
  label: "Stripe Checkout",
  capability: "payments",
  class: "hard",
  summary: "Stripe-baserad checkout.",
  envVarCount: 1,
  envVars: [{ key: "STRIPE_SECRET_KEY", required: true }],
  requiresF3: true,
  groupId: "commerce",
  groupLabel: "Betalning & handel",
};

function renderView(
  overrides: Partial<Parameters<typeof DossierCatalogStagingView>[0]> = {},
) {
  return render(
    <DossierCatalogStagingView
      entry={stripeEntry}
      stage="design"
      confirmed={false}
      catalogPickDisabled={false}
      projectId="proj_1"
      keyValues={{ STRIPE_SECRET_KEY: "sk_test" }}
      setKeyValues={vi.fn()}
      saving={false}
      saveError={null}
      saveConfirmation={false}
      onSaveKeys={vi.fn()}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}

describe("DossierCatalogStagingView", () => {
  it("disables Lägg till i sajten while a key is being saved", () => {
    renderView({ saving: true });
    expect(
      screen.getByRole("button", { name: "Lägg till i sajten" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Spara nyckel" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("disables Avbryt and confirm while the catalog request is in flight", () => {
    renderView({ confirming: true });
    expect(
      screen.getByRole("button", { name: "Lägg till i sajten" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Avbryt" }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps confirm enabled when keys are filled and nothing is saving", () => {
    renderView();
    expect(
      screen.getByRole("button", { name: "Lägg till i sajten" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("labels required keys as required for live and explains cancel", () => {
    renderView();
    expect(screen.getByText("krävs för live")).toBeTruthy();
    expect(screen.queryByText("rekommenderad")).toBeNull();
    expect(screen.getByText(/Redan sparade nycklar ligger kvar/i)).toBeTruthy();
  });
});
