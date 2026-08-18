import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelDossiers } from "./PreviewPanelDossiers";
import { openDossiersPanel } from "@/lib/builder/project-env-events";
import {
  catalogResponse,
  stubFetch,
  wiredResponse,
} from "./PreviewPanelDossiers.test-support";
import type { DossierCatalogResponse } from "@/lib/builder/dossier-catalog";

function catalogWithAnalytics(): DossierCatalogResponse {
  const base = catalogResponse();
  return {
    ...base,
    total: base.total + 1,
    groups: [
      ...base.groups,
      {
        id: "analytics",
        label: "Analys",
        dossiers: [
          {
            id: "vercel-analytics",
            label: "Besöksstatistik",
            capability: "analytics",
            class: "hard",
            summary: "Vercel Analytics.",
            envVarCount: 0,
            envVars: [],
            requiresF3: false,
            groupId: "analytics",
            groupLabel: "Analys",
          },
        ],
      },
    ],
  };
}

describe("PreviewPanelDossiers catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("always shows the trigger button; the count badge only renders when total > 0", async () => {
    stubFetch({ wired: wiredResponse({ counts: { total: 0, hard: 0, soft: 0, builtLive: 0, builtDemo: 0, blockedBuild: 0, planned: 0 } }) });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Byggblock/i })).toBeTruthy();
    });
    // No numeric badge next to the trigger label when nothing is wired.
    expect(screen.queryByText("0")).toBeNull();
  });

  it("defaults the popover to 'Fler byggblock' when nothing is wired, and lists catalog dossiers grouped by category", async () => {
    stubFetch({ wired: wiredResponse() /* total: 0 */ });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    // Open via the shared event (same mechanism other builder surfaces use —
    // avoids depending on Radix's pointer-driven trigger-click behavior).
    await act(async () => {
      openDossiersPanel();
    });

    await waitFor(() => {
      expect(screen.getByText("Betalning & handel")).toBeTruthy();
    });
    expect(screen.getByText("Stripe Checkout")).toBeTruthy();
    expect(screen.getByText("Klarna Checkout")).toBeTruthy();
    expect(screen.getByText("Bildgalleri med lightbox")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "På sajten (0)" }).getAttribute("data-state")).toBe(
      "inactive",
    );
    expect(
      screen.getByRole("tab", { name: "Fler byggblock (3)" }).getAttribute("data-state"),
    ).toBe("active");
    expect(screen.getByText("Katalog: 3 totalt · 2 externa · 1 utan tjänst")).toBeTruthy();
    // The "På sajten" tab's empty-state copy must NOT be what greets the
    // user when there is nothing wired — the catalog tab is shown instead.
    expect(screen.queryByText("Inga byggblock är inkopplade i den här versionen.")).toBeNull();
  });

  it("filters the catalog by external-service need without hiding the integration-build signal", async () => {
    stubFetch({ wired: wiredResponse() });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel();
    });

    const standaloneFilter = await screen.findByRole("button", {
      name: "Fristående (1)",
    });
    fireEvent.click(standaloneFilter);

    expect(screen.getByText("Bildgalleri med lightbox")).toBeTruthy();
    expect(screen.queryByText("Stripe Checkout")).toBeNull();
    expect(screen.queryByText("Betalning & handel")).toBeNull();
    expect(standaloneFilter.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Kopplad (2)" }));

    expect(screen.getByText("Stripe Checkout")).toBeTruthy();
    expect(screen.getByText("Klarna Checkout")).toBeTruthy();
    expect(screen.queryByText("Bildgalleri med lightbox")).toBeNull();
    expect(screen.getAllByText("Kopplad")).toHaveLength(2);
    expect(screen.getAllByText("Kräver integrationsbygge")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Alla (3)" }));
    expect(screen.getByText("Bildgalleri med lightbox")).toBeTruthy();
  });

  it("resets the class filter when the popover closes so the next open shows the full catalog", async () => {
    stubFetch({ wired: wiredResponse() });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel();
    });

    const standaloneFilter = await screen.findByRole("button", {
      name: "Fristående (1)",
    });
    fireEvent.click(standaloneFilter);
    expect(screen.queryByText("Stripe Checkout")).toBeNull();

    // Close (Escape) and reopen: a leftover filter must not make the catalog
    // look truncated on the next, unrelated open.
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {
      openDossiersPanel();
    });

    const allFilter = await screen.findByRole("button", { name: "Alla (3)" });
    expect(allFilter.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Stripe Checkout")).toBeTruthy();
    expect(screen.getByText("Bildgalleri med lightbox")).toBeTruthy();
  });

  it("stages a catalog click without sending, then confirms one request with placement lines", async () => {
    stubFetch({ wired: wiredResponse({ lifecycleStage: "design" }) });
    const onRequestDossier = vi.fn();

    render(
      <PreviewPanelDossiers
        chatId="chat_1"
        versionId="ver_1"
        lifecycleStage="design"
        onRequestDossier={onRequestDossier}
      />,
    );

    await act(async () => {
      openDossiersPanel();
    });

    const stripeRow = await screen.findByTitle("Välj byggblocket Stripe Checkout");
    fireEvent.click(stripeRow);

    expect(onRequestDossier).not.toHaveBeenCalled();
    expect(screen.getByText("Valt, ej tillagt")).toBeTruthy();
    expect(screen.getByText("Var ska blocket placeras?")).toBeTruthy();
    expect(screen.getByText(/I designen visas en demo/i)).toBeTruthy();
    expect(screen.queryByText("Klarna Checkout")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Egen sida" }));
    fireEvent.click(screen.getByRole("button", { name: "Lägg till i sajten" }));

    expect(onRequestDossier).toHaveBeenCalledTimes(1);
    expect(onRequestDossier).toHaveBeenCalledWith({
      id: "stripe-checkout",
      label: "Stripe Checkout",
      stagingLines: ["Placering: Egen sida"],
    });
    expect(screen.getByText(/I designen visas en demo/i)).toBeTruthy();
  });

  it("cancels a staged pick without calling onRequestDossier", async () => {
    stubFetch({ wired: wiredResponse() });
    const onRequestDossier = vi.fn();

    render(
      <PreviewPanelDossiers
        chatId="chat_1"
        versionId="ver_1"
        onRequestDossier={onRequestDossier}
      />,
    );

    await act(async () => {
      openDossiersPanel();
    });

    fireEvent.click(await screen.findByTitle("Välj byggblocket Stripe Checkout"));
    expect(screen.getByText("Valt, ej tillagt")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Avbryt" }));

    expect(onRequestDossier).not.toHaveBeenCalled();
    expect(screen.queryByText("Valt, ej tillagt")).toBeNull();
    expect(screen.getByTitle("Välj byggblocket Stripe Checkout")).toBeTruthy();
  });

  it("confirms an invisible block without a staging question", async () => {
    stubFetch({
      wired: wiredResponse({ lifecycleStage: "integrations" }),
      catalog: catalogWithAnalytics(),
    });
    const onRequestDossier = vi.fn();

    render(
      <PreviewPanelDossiers
        chatId="chat_1"
        versionId="ver_1"
        lifecycleStage="integrations"
        onRequestDossier={onRequestDossier}
      />,
    );

    await act(async () => {
      openDossiersPanel();
    });

    fireEvent.click(await screen.findByTitle("Välj byggblocket Besöksstatistik"));

    expect(onRequestDossier).not.toHaveBeenCalled();
    expect(screen.getByText("Valt, ej tillagt")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText("Var ska blocket placeras?")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Lägg till i sajten" }));

    expect(onRequestDossier).toHaveBeenCalledTimes(1);
    expect(onRequestDossier).toHaveBeenCalledWith({
      id: "vercel-analytics",
      label: "Besöksstatistik",
    });
  });

  it("shows optional key fields on a hard block but confirms without a key", async () => {
    stubFetch({ wired: wiredResponse({ lifecycleStage: "design" }) });
    const onRequestDossier = vi.fn();

    render(
      <PreviewPanelDossiers
        chatId="chat_1"
        versionId="ver_1"
        lifecycleStage="design"
        onRequestDossier={onRequestDossier}
      />,
    );

    await act(async () => {
      openDossiersPanel();
    });

    fireEvent.click(await screen.findByTitle("Välj byggblocket Stripe Checkout"));

    expect(screen.getByLabelText("Värde för STRIPE_SECRET_KEY")).toBeTruthy();
    expect(screen.getByText("Utan nyckel körs demo.")).toBeTruthy();
    expect(screen.getAllByText("krävs för live").length).toBeGreaterThan(0);
    expect(screen.queryByText("rekommenderad")).toBeNull();
    expect(
      screen.getByText(/Avbryt lägger inte till byggblocket/i),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Spara nyckel" }).hasAttribute("disabled")).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Lägg till i sajten" }));

    expect(onRequestDossier).toHaveBeenCalledTimes(1);
    expect(onRequestDossier).toHaveBeenCalledWith({
      id: "stripe-checkout",
      label: "Stripe Checkout",
    });
  });

  it("ignores a late catalog accept after the chat context has changed", async () => {
    stubFetch({ wired: wiredResponse({ lifecycleStage: "design" }) });
    let resolveRequest: ((value: boolean) => void) | undefined;
    const onRequestDossier = vi.fn().mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    const { rerender } = render(
      <PreviewPanelDossiers
        chatId="chat_1"
        versionId="ver_1"
        lifecycleStage="design"
        onRequestDossier={onRequestDossier}
      />,
    );

    await act(async () => {
      openDossiersPanel();
    });

    fireEvent.click(await screen.findByTitle("Välj byggblocket Stripe Checkout"));
    fireEvent.click(screen.getByRole("button", { name: "Lägg till i sajten" }));

    await waitFor(() => {
      expect(onRequestDossier).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByRole("button", { name: "Avbryt" }).hasAttribute("disabled")).toBe(true);

    rerender(
      <PreviewPanelDossiers
        chatId="chat_2"
        versionId="ver_2"
        lifecycleStage="design"
        onRequestDossier={onRequestDossier}
      />,
    );

    await act(async () => {
      resolveRequest?.(true);
    });

    expect(screen.queryByText("Tillagt via chatten")).toBeNull();
    expect(screen.queryByText("Valt, ej tillagt")).toBeNull();
  });

  it("does not mark a hard block as added when the catalog request is rejected", async () => {
    stubFetch({ wired: wiredResponse({ lifecycleStage: "design" }) });
    const onRequestDossier = vi.fn().mockResolvedValue(false);

    render(
      <PreviewPanelDossiers
        chatId="chat_1"
        versionId="ver_1"
        lifecycleStage="design"
        onRequestDossier={onRequestDossier}
      />,
    );

    await act(async () => {
      openDossiersPanel();
    });

    fireEvent.click(await screen.findByTitle("Välj byggblocket Stripe Checkout"));
    fireEvent.click(screen.getByRole("button", { name: "Lägg till i sajten" }));

    await waitFor(() => {
      expect(onRequestDossier).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText("Valt, ej tillagt")).toBeTruthy();
    expect(screen.queryByText("Tillagt via chatten")).toBeNull();
    expect(screen.getByRole("button", { name: "Avbryt" }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("blocks catalog picks while a generation streams or a question is pending (catalogPickDisabled)", async () => {
    stubFetch({ wired: wiredResponse() });
    const onRequestDossier = vi.fn();

    render(
      <PreviewPanelDossiers
        chatId="chat_1"
        versionId="ver_1"
        onRequestDossier={onRequestDossier}
        catalogPickDisabled
      />,
    );

    await act(async () => {
      openDossiersPanel();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Vänta tills pågående generering är klar/i),
      ).toBeTruthy();
    });
    const stripeRow = screen.getByText("Stripe Checkout").closest("button");
    expect(stripeRow?.hasAttribute("disabled")).toBe(true);
    fireEvent.click(stripeRow!);
    expect(onRequestDossier).not.toHaveBeenCalled();
    expect(screen.queryByText("Valt, ej tillagt")).toBeNull();
  });

});

