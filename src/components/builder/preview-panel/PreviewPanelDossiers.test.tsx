import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelDossiers } from "./PreviewPanelDossiers";
import { dispatchVersionStatusRefreshed, openDossiersPanel } from "@/lib/builder/project-env-events";
import type { DossierOverviewResponse } from "@/lib/builder/dossier-overview";
import type { DossierCatalogResponse } from "@/lib/builder/dossier-catalog";

function wiredResponse(overrides: Partial<DossierOverviewResponse> = {}): DossierOverviewResponse {
  return {
    success: true,
    projectId: "proj_1",
    versionId: "ver_1",
    lifecycleStage: "design",
    versionFilesAvailable: true,
    counts: { total: 0, hard: 0, soft: 0, builtReady: 0, builtNeedsKeys: 0, notBuilt: 0 },
    dossiers: [],
    ...overrides,
  };
}

function catalogResponse(overrides: Partial<DossierCatalogResponse> = {}): DossierCatalogResponse {
  return {
    success: true,
    total: 2,
    groups: [
      {
        id: "payments",
        label: "Betalningar",
        dossiers: [
          {
            id: "stripe-checkout",
            label: "Stripe Checkout",
            capability: "payments",
            class: "hard",
            summary: "Stripe-baserad checkout.",
            envVarCount: 2,
            groupId: "payments",
            groupLabel: "Betalningar",
          },
          {
            id: "klarna-checkout",
            label: "Klarna Checkout",
            capability: "payments",
            class: "hard",
            summary: "Klarna-baserad checkout.",
            envVarCount: 1,
            groupId: "payments",
            groupLabel: "Betalningar",
          },
        ],
      },
    ],
    ...overrides,
  };
}

function stubFetch(options: {
  wired?: DossierOverviewResponse;
  catalog?: DossierCatalogResponse;
}) {
  const wired = options.wired ?? wiredResponse();
  const catalog = options.catalog ?? catalogResponse();
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/dossiers/catalog")) {
      return Response.json(catalog);
    }
    if (url.includes("/dossiers")) {
      return Response.json(wired);
    }
    return Response.json({}, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("PreviewPanelDossiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("always shows the trigger button; the count badge only renders when total > 0", async () => {
    stubFetch({ wired: wiredResponse({ counts: { total: 0, hard: 0, soft: 0, builtReady: 0, builtNeedsKeys: 0, notBuilt: 0 } }) });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Byggblock/i })).toBeTruthy();
    });
    // No numeric badge next to the trigger label when nothing is wired.
    expect(screen.queryByText("0")).toBeNull();
  });

  it("defaults the popover to 'Bläddra katalog' when nothing is wired, and lists catalog dossiers grouped by category", async () => {
    stubFetch({ wired: wiredResponse() /* total: 0 */ });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    // Open via the shared event (same mechanism other builder surfaces use —
    // avoids depending on Radix's pointer-driven trigger-click behavior).
    await act(async () => {
      openDossiersPanel();
    });

    await waitFor(() => {
      expect(screen.getByText("Betalningar")).toBeTruthy();
    });
    expect(screen.getByText("Stripe Checkout")).toBeTruthy();
    expect(screen.getByText("Klarna Checkout")).toBeTruthy();
    // The "Inkopplade"-tab's empty-state copy must NOT be what greets the
    // user when there is nothing wired — the catalog tab is shown instead.
    expect(screen.queryByText("Inga byggblock är inkopplade i den här versionen.")).toBeNull();
  });

  it("sends 'Lägg till byggblocket <label>' via onRequestDossier and closes the popover when a catalog row is picked", async () => {
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

    const stripeRow = await screen.findByTitle("Lägg till byggblocket Stripe Checkout");
    fireEvent.click(stripeRow);

    expect(onRequestDossier).toHaveBeenCalledWith("Stripe Checkout");
    await waitFor(() => {
      expect(screen.queryByText("Betalningar")).toBeNull();
    });
  });

  it("keeps 'Inkopplade' as the default tab when the version already has wired dossiers", async () => {
    stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 0, soft: 1, builtReady: 0, builtNeedsKeys: 0, notBuilt: 0 },
        dossiers: [
          {
            id: "faq-accordion",
            label: "FAQ Accordion",
            class: "soft",
            capability: "faq-section",
            summary: "Statisk FAQ-sektion.",
            complexity: "simple",
            requiresF3: false,
            configured: true,
            dependencies: [],
            envVars: [],
            status: "self-contained",
            missingKeys: [],
            lastVerified: "2026-01-01",
          },
        ],
      }),
    });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel();
    });

    await waitFor(() => {
      expect(screen.getByText("FAQ Accordion")).toBeTruthy();
    });
    // The catalog tab's content is not shown by default when something is
    // already wired.
    expect(screen.queryByText("Stripe Checkout")).toBeNull();
  });

  it("refetches the wired list when a new version lands while the popover is open (versionStatusNonce signal)", async () => {
    const fetchMock = stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 1, soft: 0, builtReady: 0, builtNeedsKeys: 1, notBuilt: 0 },
        dossiers: [
          {
            id: "stripe-checkout",
            label: "Stripe Checkout",
            class: "hard",
            capability: "payments",
            summary: "Stripe-baserad checkout.",
            complexity: "medium",
            requiresF3: true,
            configured: false,
            dependencies: [],
            envVars: [],
            status: "built-needs-keys",
            missingKeys: ["STRIPE_SECRET_KEY"],
            lastVerified: "2026-01-01",
          },
        ],
      }),
    });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel();
    });

    await waitFor(() => {
      expect(screen.getAllByText("Stripe Checkout").length).toBeGreaterThan(0);
    });
    const wiredCallCount = () =>
      fetchMock.mock.calls.filter(
        (call) => String(call[0]).includes("/chats/") && String(call[0]).includes("/dossiers"),
      ).length;
    const callsBeforeRefresh = wiredCallCount();

    await act(async () => {
      dispatchVersionStatusRefreshed();
    });

    await waitFor(() => {
      expect(wiredCallCount()).toBeGreaterThan(callsBeforeRefresh);
    });
  });
});
