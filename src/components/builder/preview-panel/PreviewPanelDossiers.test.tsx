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
    counts: { total: 0, hard: 0, soft: 0, builtLive: 0, builtDemo: 0, blockedBuild: 0, planned: 0 },
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
        id: "commerce",
        label: "Betalning & handel",
        dossiers: [
          {
            id: "stripe-checkout",
            label: "Stripe Checkout",
            capability: "payments",
            class: "hard",
            summary: "Stripe-baserad checkout.",
            envVarCount: 2,
            groupId: "commerce",
            groupLabel: "Betalning & handel",
          },
          {
            id: "klarna-checkout",
            label: "Klarna Checkout",
            capability: "payments",
            class: "hard",
            summary: "Klarna-baserad checkout.",
            envVarCount: 1,
            groupId: "commerce",
            groupLabel: "Betalning & handel",
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
    stubFetch({ wired: wiredResponse({ counts: { total: 0, hard: 0, soft: 0, builtLive: 0, builtDemo: 0, blockedBuild: 0, planned: 0 } }) });

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
      expect(screen.getByText("Betalning & handel")).toBeTruthy();
    });
    expect(screen.getByText("Stripe Checkout")).toBeTruthy();
    expect(screen.getByText("Klarna Checkout")).toBeTruthy();
    // The "Inkopplade"-tab's empty-state copy must NOT be what greets the
    // user when there is nothing wired — the catalog tab is shown instead.
    expect(screen.queryByText("Inga byggblock är inkopplade i den här versionen.")).toBeNull();
  });

  it("sends id+label via onRequestDossier when a catalog row is picked and keeps the popover open with an F2-mockup notice for a HARD dossier in design stage", async () => {
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

    const stripeRow = await screen.findByTitle("Lägg till byggblocket Stripe Checkout");
    fireEvent.click(stripeRow);

    expect(onRequestDossier).toHaveBeenCalledWith({
      id: "stripe-checkout",
      label: "Stripe Checkout",
    });
    // Hard pick in F2: the popover STAYS OPEN and shows the mockup notice.
    expect(
      screen.getByText(/visas som mockup i designläget/i),
    ).toBeTruthy();

    // One-shot lock: a second click on another row does nothing.
    const klarnaRow = screen.getByText("Klarna Checkout").closest("button");
    expect(klarnaRow).toBeTruthy();
    fireEvent.click(klarnaRow!);
    expect(onRequestDossier).toHaveBeenCalledTimes(1);
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
  });

  it("keeps 'Inkopplade' as the default tab when the version already has wired dossiers", async () => {
    stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 0, soft: 1, builtLive: 0, builtDemo: 0, blockedBuild: 0, planned: 0 },
        dossiers: [
          {
            id: "gallery-lightbox",
            label: "Bildgalleri med lightbox",
            class: "soft",
            capability: "gallery-lightbox",
            summary: "Click-to-enlarge image gallery.",
            summarySv: "Bildgalleri där bilder kan förstoras.",
            complexity: "simple",
            requiresF3: false,
            configured: true,
            dependencies: [],
            envVars: [],
            status: "self-contained",
            missingKeys: [],
            missingLiveKeys: [],
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
      expect(screen.getByText("Bildgalleri med lightbox")).toBeTruthy();
    });
    // The catalog tab's content is not shown by default when something is
    // already wired.
    expect(screen.queryByText("Stripe Checkout")).toBeNull();
  });

  // Owner decision 2026-07-13 (replaces the old catalog/status-only lock):
  // opening with env-key detail FOCUSES the dossier owning those keys and the
  // expanded row carries a masked write-only input for each missing key.
  it("focuses the dossier owning requested env keys and shows masked inputs (412 → Byggblock)", async () => {
    stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 0, blockedBuild: 1, planned: 0 },
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
            envVars: [
              {
                key: "STRIPE_SECRET_KEY",
                required: true,
                enforcement: "build",
                purpose: "Server-side Stripe auth.",
                hasRealValue: false,
                placeholderCovered: false,
              },
            ],
            status: "blocked-build",
            missingKeys: ["STRIPE_SECRET_KEY"],
            missingLiveKeys: [],
            lastVerified: "2026-01-01",
          },
        ],
      }),
    });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["STRIPE_SECRET_KEY"]);
    });

    await screen.findByText("Stripe Checkout");
    // The matching row is auto-expanded and offers a masked input for the key.
    await waitFor(() => {
      expect(document.querySelector('input[type="password"]')).not.toBeNull();
    });
    expect(screen.getByLabelText("Värde för STRIPE_SECRET_KEY")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Spara och aktivera/i })).toBeTruthy();
  });

  // Regression (owner spec PR 1): saving a key goes straight to the canonical
  // env-vars API — no chat message, no new LLM generation — and the panel
  // refetches so the status can flip demo → live. The typed secret must never
  // be rendered back into the DOM.
  it("saves a filled key to the project env-vars API without sending any chat message", async () => {
    const demoResponse = wiredResponse({
      counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
      dossiers: [
        {
          id: "openai-chat",
          label: "OpenAI Chat",
          class: "hard",
          capability: "ai-chat",
          summary: "Chatbot via OpenAI.",
          complexity: "medium",
          requiresF3: true,
          configured: false,
          dependencies: [],
          envVars: [
            {
              key: "OPENAI_API_KEY",
              required: true,
              enforcement: "feature-runtime",
              purpose: "OpenAI auth.",
              hasRealValue: false,
              placeholderCovered: true,
            },
          ],
          status: "built-demo",
          missingKeys: [],
          missingLiveKeys: ["OPENAI_API_KEY"],
          lastVerified: "2026-01-01",
        },
      ],
    });
    const savedCalls: Array<{ url: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        savedCalls.push({ url, body: JSON.parse(String(init?.body ?? "null")) });
        return Response.json({ success: true });
      }
      if (url.includes("/api/dossiers/catalog")) {
        return Response.json(catalogResponse());
      }
      if (url.includes("/dossiers")) {
        return Response.json(demoResponse);
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onRequestDossier = vi.fn();

    render(
      <PreviewPanelDossiers
        chatId="chat_1"
        versionId="ver_1"
        onRequestDossier={onRequestDossier}
      />,
    );

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-my-secret-key" } });
    const dossierFetchCallsBeforeSave = fetchMock.mock.calls.filter(
      (call) => String(call[0]).includes("/chats/") && String(call[0]).includes("/dossiers"),
    ).length;
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    await waitFor(() => {
      expect(savedCalls.length).toBe(1);
    });
    expect(savedCalls[0].url).toContain("/api/v0/projects/proj_1/env-vars");
    expect(savedCalls[0].body).toEqual({
      vars: [{ key: "OPENAI_API_KEY", value: "sk-my-secret-key", sensitive: true }],
      upsert: true,
    });
    // No chat transport involved (catalog picks are the only chat bridge).
    expect(onRequestDossier).not.toHaveBeenCalled();
    // The save event triggers a status refetch (demo → live comes from data).
    await waitFor(() => {
      const after = fetchMock.mock.calls.filter(
        (call) => String(call[0]).includes("/chats/") && String(call[0]).includes("/dossiers"),
      ).length;
      expect(after).toBeGreaterThan(dossierFetchCallsBeforeSave);
    });
    // The cleared input never echoes the secret back into the DOM.
    expect(document.body.innerHTML).not.toContain("sk-my-secret-key");
  });

  // Regression (Bugbot on this diff): a typed-but-unsaved secret draft must
  // not survive a chat switch — the panel stays mounted across chats, and a
  // stale draft could otherwise be saved into the NEXT chat's project.
  it("clears unsaved key drafts when the chat changes", async () => {
    const demoDossier = {
      id: "openai-chat",
      label: "OpenAI Chat",
      class: "hard" as const,
      capability: "ai-chat",
      summary: "Chatbot via OpenAI.",
      complexity: "medium" as const,
      requiresF3: true,
      configured: false,
      dependencies: [],
      envVars: [
        {
          key: "OPENAI_API_KEY",
          required: true,
          enforcement: "feature-runtime" as const,
          purpose: "OpenAI auth.",
          hasRealValue: false,
          placeholderCovered: true,
        },
      ],
      status: "built-demo" as const,
      missingKeys: [],
      missingLiveKeys: ["OPENAI_API_KEY"],
      lastVerified: "2026-01-01",
    };
    stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
        dossiers: [demoDossier],
      }),
    });

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });
    const input = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-draft-secret" } });
    expect((input as HTMLInputElement).value).toBe("sk-draft-secret");

    rerender(<PreviewPanelDossiers chatId="chat_2" versionId="ver_1" />);
    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });
    const inputAfterSwitch = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    expect((inputAfterSwitch as HTMLInputElement).value).toBe("");
  });

  // Regression (Bugbot on this diff): the 412 focus request must survive the
  // refetch the open-event itself triggers — the target dossier may only
  // exist in the fresher response.
  it("applies the focus request against the refetched data when the cached overview misses the dossier", async () => {
    const stripeDossier = {
      id: "stripe-checkout",
      label: "Stripe Checkout",
      class: "hard" as const,
      capability: "payments",
      summary: "Stripe-baserad checkout.",
      complexity: "medium" as const,
      requiresF3: true,
      configured: false,
      dependencies: [],
      envVars: [
        {
          key: "STRIPE_SECRET_KEY",
          required: true,
          enforcement: "build" as const,
          purpose: "Stripe auth.",
          hasRealValue: false,
          placeholderCovered: false,
        },
      ],
      status: "blocked-build" as const,
      missingKeys: ["STRIPE_SECRET_KEY"],
      missingLiveKeys: [],
      lastVerified: "2026-01-01",
    };
    let dossierCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/dossiers/catalog")) {
        return Response.json(catalogResponse());
      }
      if (url.includes("/dossiers")) {
        dossierCalls += 1;
        // First (mount) response is stale/empty; later responses carry the row.
        return Response.json(
          dossierCalls === 1
            ? wiredResponse()
            : wiredResponse({
                counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 0, blockedBuild: 1, planned: 0 },
                dossiers: [stripeDossier],
              }),
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);
    await waitFor(() => {
      expect(dossierCalls).toBeGreaterThanOrEqual(1);
    });

    await act(async () => {
      openDossiersPanel(["STRIPE_SECRET_KEY"]);
    });

    // The open-triggered refetch delivers the dossier; the pending focus must
    // still apply — expanded row with the masked input.
    await waitFor(() => {
      expect(document.querySelector('input[type="password"]')).not.toBeNull();
    });
    expect(screen.getByLabelText("Värde för STRIPE_SECRET_KEY")).toBeTruthy();
  });

  // Regression (coach finding #2): a BUILT dossier missing only a
  // feature-runtime key (Stripe/OpenAI-fallet) must light the attention dot.
  it("lights the attention dot for a built-demo dossier (missing feature-runtime key)", async () => {
    stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
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
            envVars: [
              {
                key: "STRIPE_SECRET_KEY",
                required: true,
                enforcement: "feature-runtime",
                purpose: "Stripe auth.",
                hasRealValue: false,
                placeholderCovered: false,
              },
            ],
            status: "built-demo",
            missingKeys: [],
            missingLiveKeys: ["STRIPE_SECRET_KEY"],
            lastVerified: "2026-01-01",
          },
        ],
      }),
    });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await waitFor(() => {
      expect(
        screen.getByLabelText(/Åtgärd krävs: en integration är blockerad eller kör i demo-läge/i),
      ).toBeTruthy();
    });
  });

  it("keeps the attention dot off for planned dossiers (nothing actionable yet)", async () => {
    stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 0, blockedBuild: 0, planned: 1 },
        dossiers: [
          {
            id: "openai-chat",
            label: "OpenAI Chat",
            class: "hard",
            capability: "ai-chat",
            summary: "Chatbot via OpenAI.",
            complexity: "medium",
            requiresF3: true,
            configured: false,
            dependencies: [],
            envVars: [
              {
                key: "OPENAI_API_KEY",
                required: true,
                enforcement: "feature-runtime",
                purpose: "OpenAI auth.",
                hasRealValue: false,
                placeholderCovered: true,
              },
            ],
            status: "planned",
            missingKeys: [],
            missingLiveKeys: ["OPENAI_API_KEY"],
            lastVerified: "2026-01-01",
          },
        ],
      }),
    });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Byggblock/i })).toBeTruthy();
    });
    expect(screen.queryByLabelText(/Åtgärd krävs/i)).toBeNull();
  });

  it("refetches the wired list when a new version lands while the popover is open (versionStatusNonce signal)", async () => {
    const fetchMock = stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 0, blockedBuild: 1, planned: 0 },
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
            status: "blocked-build",
            missingKeys: ["STRIPE_SECRET_KEY"],
            missingLiveKeys: [],
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
