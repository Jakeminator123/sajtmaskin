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
    total: 3,
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
            requiresF3: true,
            mock: "visual",
            groupId: "commerce",
            groupLabel: "Betalning & handel",
          },
          {
            // Kopplad MEN F2-klar (feature-runtime-nycklar, inga serverfiler)
            // — beviset för att hard/soft inte kan härledas till F2/F3.
            id: "klarna-checkout",
            label: "Klarna Checkout",
            capability: "payments",
            class: "hard",
            summary: "Klarna-baserad checkout.",
            envVarCount: 1,
            requiresF3: false,
            mock: "visual",
            groupId: "commerce",
            groupLabel: "Betalning & handel",
          },
        ],
      },
      {
        id: "media",
        label: "Media & galleri",
        dossiers: [
          {
            id: "gallery-lightbox",
            label: "Bildgalleri med lightbox",
            capability: "gallery-lightbox",
            class: "soft",
            summary: "Click-to-enlarge image gallery.",
            summarySv: "Bildgalleri där bilder kan förstoras.",
            envVarCount: 0,
            requiresF3: false,
            groupId: "media",
            groupLabel: "Media & galleri",
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
      name: "Ingen extern tjänst (1)",
    });
    fireEvent.click(standaloneFilter);

    expect(screen.getByText("Bildgalleri med lightbox")).toBeTruthy();
    expect(screen.queryByText("Stripe Checkout")).toBeNull();
    expect(screen.queryByText("Betalning & handel")).toBeNull();
    expect(standaloneFilter.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Extern tjänst (2)" }));

    expect(screen.getByText("Stripe Checkout")).toBeTruthy();
    expect(screen.getByText("Klarna Checkout")).toBeTruthy();
    expect(screen.queryByText("Bildgalleri med lightbox")).toBeNull();
    expect(screen.getAllByText("Extern tjänst")).toHaveLength(2);
    expect(screen.getAllByText("Bygg integrationer")).toHaveLength(1);

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
      name: "Ingen extern tjänst (1)",
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

  it("sends id+label via onRequestDossier when a catalog row is picked and keeps the popover open with a design-stage surface-only notice for a HARD dossier", async () => {
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
    // Hard pick in F2: the popover STAYS OPEN and shows the surface-only notice.
    expect(
      screen.getByText(/I designen visas en demo/i),
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

  it("keeps 'På sajten' as the default tab when the version already has wired dossiers", async () => {
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
    expect(screen.getByRole("tab", { name: "På sajten (1)" }).getAttribute("data-state")).toBe(
      "active",
    );
    // Lucka 2 (ägarbeslut 2026-08-11): the old "Version: N kopplade · M
    // fristående" line is gone — it duplicated the "Inkopplade (N)" tab and
    // the catalog filters without saying WHICH version the status describes.
    // Without `activeVersionMeta` we still fall back to a short id from
    // `versionId` (Bugbot: meta often lags right after F3 settle) rather than
    // leaving the header blank while dossiers for that version are visible.
    expect(screen.queryByText(/kopplade ·.*fristående/)).toBeNull();
    expect(screen.getByText("Version #ver_1")).toBeTruthy();
    // The catalog tab's content is not shown by default when something is
    // already wired.
    expect(screen.queryByText("Stripe Checkout")).toBeNull();
  });

  // Lucka 2 (ägarbeslut 2026-08-11): the popover header now says WHICH
  // version the wired-list status describes, buried by the removed
  // "Version: N kopplade · M fristående" line (see the test above).
  it("lucka 2: shows the active version's identity in the popover header instead of a redundant counter", async () => {
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

    render(
      <PreviewPanelDossiers
        chatId="chat_1"
        versionId="ver_1"
        activeVersionMeta={{ versionNumber: 4, createdAt: "2026-08-11T12:32:00.000Z" }}
      />,
    );

    await act(async () => {
      openDossiersPanel();
    });

    await waitFor(() => {
      // Time zone may shift the hour; locale is pinned to sv-SE 24h in
      // `describeActiveVersionLabel`, so the shape is always HH:MM (no AM/PM).
      expect(screen.getByText(/^Version 4 · byggd \d{1,2}:\d{2}$/)).toBeTruthy();
    });
  });

  // Bugbot on this diff: `activeVersionMeta` comes from `effectiveVersionsList`,
  // which often lags behind `activeVersionId` (e.g. F3 settle selects the new
  // id before `mutateVersions()` finishes). While dossiers for that versionId
  // are already loaded, the header must not go blank — fall back to a short id.
  it("lucka 2: falls back to a short versionId when activeVersionMeta has not landed yet", async () => {
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

    render(
      <PreviewPanelDossiers
        chatId="chat_1"
        versionId="ver_f3_abc123"
        activeVersionMeta={null}
      />,
    );

    await act(async () => {
      openDossiersPanel();
    });

    await waitFor(() => {
      expect(screen.getByText("Version #ver_f3")).toBeTruthy();
    });
    expect(screen.queryByText(/kopplade ·.*fristående/)).toBeNull();
  });

  // De tre axlarna (hard/soft, demoläge, F2/F3) är oberoende. Panelen visade
  // förut bara den första och lät användaren gissa resten: en Kopplad dossier
  // såg ut att kräva F3 även när den var klar i designläget, och demoläget —
  // det enda som säger vad besökaren faktiskt ser utan nycklar — syntes inte
  // alls. Katalogen visar F3-kravet FÖRE valet, raden efter valet.
  it("visar en enkel status på raden och tjänst/demoläge i detaljerna", async () => {
    stubFetch({
      wired: wiredResponse({
        counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
        dossiers: [
          {
            id: "postgres-drizzle",
            label: "Databas — Postgres",
            class: "hard",
            capability: "database",
            summary: "Postgres via Drizzle.",
            complexity: "medium",
            requiresF3: true,
            mock: "seed",
            configured: false,
            dependencies: [],
            envVars: [],
            status: "built-demo",
            missingKeys: [],
            missingLiveKeys: ["POSTGRES_URL"],
            lastVerified: "2026-01-01",
          },
        ],
      }),
    });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);
    await act(async () => {
      openDossiersPanel();
    });

    const row = await screen.findByText("Databas — Postgres");
    expect(screen.getByText("Demo")).toBeTruthy();
    expect(screen.queryByText("Extern tjänst")).toBeNull();
    // Demoläget bor i den expanderade raden (där det finns plats för det).
    expect(screen.queryByText(/Demoläge: Medskickad demo-data/)).toBeNull();
    fireEvent.click(row);
    expect(screen.getByText("Extern tjänst")).toBeTruthy();
    expect(screen.getByText(/Demoläge: Medskickad demo-data/)).toBeTruthy();
  });

  it("visar byggsteget bara för katalogbyggblock som behöver det", async () => {
    stubFetch({ wired: wiredResponse() /* total: 0 → katalog-tabben */ });

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);
    await act(async () => {
      openDossiersPanel();
    });

    await screen.findByText("Klarna Checkout");
    // Båda katalograderna använder en extern tjänst; bara Stripe behöver
    // det separata integrationsbygget.
    expect(screen.getAllByText("Extern tjänst")).toHaveLength(2);
    expect(screen.getAllByText("Bygg integrationer")).toHaveLength(1);
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
                setupUrl: "https://docs.stripe.com/keys",
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
    expect(screen.getByText("Server-side Stripe auth.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Hämta värde/i }).getAttribute("href"),
    ).toBe("https://docs.stripe.com/keys");
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

  // Delete surface (P2 BB#envdel1): the removed ProjectEnvVarsPanel was the
  // only UI that could DELETE a stored key — the Byggblock popover must offer
  // a remove path for configured keys against the canonical DELETE API.
  it("deletes a configured key via the project env-vars DELETE API", async () => {
    const configuredResponse = wiredResponse({
      counts: { total: 1, hard: 1, soft: 0, builtLive: 1, builtDemo: 0, blockedBuild: 0, planned: 0 },
      dossiers: [
        {
          id: "openai-chat",
          label: "OpenAI Chat",
          class: "hard",
          capability: "ai-chat",
          summary: "Chatbot via OpenAI.",
          complexity: "medium",
          requiresF3: true,
          configured: true,
          dependencies: [],
          envVars: [
            {
              key: "OPENAI_API_KEY",
              required: true,
              enforcement: "feature-runtime",
              purpose: "OpenAI auth.",
              hasRealValue: true,
              placeholderCovered: false,
            },
          ],
          status: "built-live",
          missingKeys: [],
          missingLiveKeys: [],
          lastVerified: "2026-01-01",
        },
      ],
    });
    const deleteCalls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        deleteCalls.push({
          url,
          method: String(init?.method ?? "GET"),
          body: JSON.parse(String(init?.body ?? "null")),
        });
        return Response.json({ success: true });
      }
      if (url.includes("/api/dossiers/catalog")) {
        return Response.json(catalogResponse());
      }
      if (url.includes("/dossiers")) {
        return Response.json(configuredResponse);
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });

    // Configured key → no input, but "Ändra värde" + "Ta bort" actions.
    const deleteButton = await screen.findByRole("button", { name: "Ta bort" });
    const dossierFetchCallsBeforeDelete = fetchMock.mock.calls.filter(
      (call) => String(call[0]).includes("/chats/") && String(call[0]).includes("/dossiers"),
    ).length;
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(deleteCalls.length).toBe(1);
    });
    expect(deleteCalls[0].url).toContain("/api/v0/projects/proj_1/env-vars");
    expect(deleteCalls[0].method).toBe("DELETE");
    expect(deleteCalls[0].body).toEqual({ keys: ["OPENAI_API_KEY"] });
    // The deleted-event triggers a status refetch (live → demo comes from data).
    await waitFor(() => {
      const after = fetchMock.mock.calls.filter(
        (call) => String(call[0]).includes("/chats/") && String(call[0]).includes("/dossiers"),
      ).length;
      expect(after).toBeGreaterThan(dossierFetchCallsBeforeDelete);
    });
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

  // Codex P2 on #573: a custom `process.env.*` key from generated code is not
  // owned by any dossier — the focus request must surface it in the "Egna
  // nycklar"-section with a savable input instead of silently doing nothing
  // (the user was otherwise stuck on an unfixable deploy/finalize blocker).
  it("surfaces an unowned custom env-blocker with a savable input (Egna nycklar)", async () => {
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
        return Response.json(wiredResponse());
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["MY_CUSTOM_SERVICE_KEY"]);
    });

    // No dossier owns the key → it lands in the custom-keys section.
    const input = await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY");
    fireEvent.change(input, { target: { value: "real-secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    await waitFor(() => {
      expect(savedCalls.length).toBe(1);
    });
    expect(savedCalls[0].url).toContain("/api/v0/projects/proj_1/env-vars");
    expect(savedCalls[0].body).toEqual({
      vars: [{ key: "MY_CUSTOM_SERVICE_KEY", value: "real-secret-value", sensitive: true }],
      upsert: true,
    });
    // Write-only: the secret never echoes back into the DOM after save.
    await waitFor(() => {
      expect(document.body.innerHTML).not.toContain("real-secret-value");
    });
  });

  // Bugbot on this diff: a deploy blocker can mix dossier-owned and custom
  // keys in ONE focus request — the dossier expand must not swallow the
  // custom key (it still needs its "Egna nycklar"-input).
  it("routes mixed focus keys to both the owning dossier and the custom section", async () => {
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
                purpose: "Stripe auth.",
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
      openDossiersPanel(["STRIPE_SECRET_KEY", "MY_CUSTOM_SERVICE_KEY"]);
    });

    // The owning dossier expands with its input…
    expect(await screen.findByLabelText("Värde för STRIPE_SECRET_KEY")).toBeTruthy();
    // …AND the unowned key gets its custom-section input.
    expect(await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY")).toBeTruthy();
  });

  it("lets the user add an arbitrary UPPER_SNAKE key manually and rejects invalid names", async () => {
    // A wired dossier keeps "Inkopplade" as the default tab, where the
    // custom-keys section lives.
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

    const nameInput = await screen.findByLabelText("Namn på egen env-nyckel");
    fireEvent.change(nameInput, { target: { value: "not a key!" } });
    fireEvent.click(screen.getByRole("button", { name: "Lägg till" }));
    expect(screen.getByText(/Ogiltigt nyckelnamn/i)).toBeTruthy();

    fireEvent.change(nameInput, { target: { value: "my_new_key" } });
    fireEvent.click(screen.getByRole("button", { name: "Lägg till" }));
    // Uppercased and rendered with its own value input.
    expect(await screen.findByLabelText("Värde för MY_NEW_KEY")).toBeTruthy();
    expect(screen.queryByText(/Ogiltigt nyckelnamn/i)).toBeNull();
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

  // Lucka 1 (ägarbeslut 2026-08-11): the generic "Miljövariabler sparade"
  // toast (`useBuilderVmPreview.ts`) is gone — the receipt now lives inline,
  // in the same row the key was typed into, and says what actually happened
  // to the byggblock (not just "saved"). Status word ("Byggd — live") comes
  // straight from `describeDossierStatus`; "Previewn" is the glossary term.
  it("lucka 1: shows an inline receipt with the new status after a successful save (replaces the removed toast)", async () => {
    let saved = false;
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
    const liveDossier = {
      ...demoDossier,
      configured: true,
      envVars: [{ ...demoDossier.envVars[0], hasRealValue: true, placeholderCovered: false }],
      status: "built-live" as const,
      missingLiveKeys: [],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        saved = true;
        return Response.json({ success: true });
      }
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) {
        return Response.json(
          wiredResponse({
            counts: saved
              ? { total: 1, hard: 1, soft: 0, builtLive: 1, builtDemo: 0, blockedBuild: 0, planned: 0 }
              : { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
            dossiers: [saved ? liveDossier : demoDossier],
          }),
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-my-secret-key" } });
    // No confirmation before the save.
    expect(screen.queryByText(/Previewn startas om/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'Ifylld — byggblocket är nu "Live". Previewn startas om med det nya värdet.',
        ),
      ).toBeTruthy();
    });
  });

  // Bugbot on this diff (lucka 1 follow-up): the receipt quotes ONE version's
  // dossier status. Switching version — even within the same chat, where
  // secret drafts intentionally survive (see the chat-switch test above) —
  // must drop a shown/pending receipt instead of leaving a stale claim about
  // the OLD version under the new one.
  it("clears the save receipt when only the version changes (not just the chat)", async () => {
    let saved = false;
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
    const liveDossier = {
      ...demoDossier,
      configured: true,
      envVars: [{ ...demoDossier.envVars[0], hasRealValue: true, placeholderCovered: false }],
      status: "built-live" as const,
      missingLiveKeys: [],
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        saved = true;
        return Response.json({ success: true });
      }
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) {
        return Response.json(
          wiredResponse({
            counts: saved
              ? { total: 1, hard: 1, soft: 0, builtLive: 1, builtDemo: 0, blockedBuild: 0, planned: 0 }
              : { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
            dossiers: [saved ? liveDossier : demoDossier],
          }),
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-my-secret-key" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    await waitFor(() => {
      expect(screen.getByText(/Previewn startas om/)).toBeTruthy();
    });

    // Same chat, new version: the receipt must not survive.
    rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);

    await waitFor(() => {
      expect(screen.queryByText(/Previewn startas om/)).toBeNull();
    });

    // The version switch also collapses the row (a separate, pre-existing
    // reset), which alone would hide the receipt regardless of whether
    // `saveConfirmation` itself got cleared. Re-expand it to check the
    // actual state, not the collapse: a missing reset would resurface the
    // stale receipt right here, since the new version's dossier list still
    // contains the same dossier id.
    fireEvent.click(screen.getByRole("button", { name: /OpenAI Chat/i }));
    expect(screen.queryByText(/Previewn startas om/)).toBeNull();
  });

  // Bugbot on this diff (lucka 1 follow-up): removing the generic toast
  // (`useBuilderVmPreview.ts`) also silenced custom-key saves — dossier rows
  // got the inline receipt above, but "Egna nycklar" has no per-row status to
  // quote, so it needs its own plain "it saved" confirmation instead of none.
  it("shows a save confirmation for custom (unowned) keys too, not just dossier rows", async () => {
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
        return Response.json(wiredResponse());
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["MY_CUSTOM_SERVICE_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY");
    fireEvent.change(input, { target: { value: "real-secret-value" } });
    // No confirmation before the save.
    expect(screen.queryByText(/Previewn startas om/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    await waitFor(() => {
      expect(savedCalls.length).toBe(1);
    });
    await waitFor(() => {
      expect(screen.getByText(/Sparat\. Previewn startas om med de nya värdena\./)).toBeTruthy();
    });
  });

  // Bugbot follow-up (second pass on this diff): handleSaveCustomKeys
  // dispatches dispatchProjectEnvVarsUpdated with the OLD versionId to
  // restart THAT version's preview, so this receipt is just as version-scoped
  // as the dossier-row one above and must not survive a version switch.
  it("clears the custom-key save confirmation when only the version changes (not just the chat)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        return Response.json({ success: true });
      }
      if (url.includes("/api/dossiers/catalog")) {
        return Response.json(catalogResponse());
      }
      if (url.includes("/dossiers")) {
        return Response.json(wiredResponse());
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["MY_CUSTOM_SERVICE_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY");
    fireEvent.change(input, { target: { value: "real-secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    await waitFor(() => {
      expect(screen.getByText(/Sparat\. Previewn startas om med de nya värdena\./)).toBeTruthy();
    });

    // Same chat, new version: the custom-key receipt must not survive.
    rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);

    await waitFor(() => {
      expect(screen.queryByText(/Sparat\. Previewn startas om med de nya värdena\./)).toBeNull();
    });
  });

  // Bugbot follow-up (3rd pass on this diff): the two tests above cover a
  // version switch AFTER a save already completed. This covers the narrower
  // race where the switch happens WHILE the save's own POST is still
  // in-flight -- the late completion must not re-arm a receipt for the
  // version it actually targeted, now that the user is looking at a
  // different one. Mirrors the `detail.versionId !== activeVersionId` guard
  // useBuilderVmPreview.ts already applies to this same dispatched event.
  it("does not resurrect the dossier-row save receipt if the version changes before the save's POST resolves", async () => {
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
    let resolveSave: ((value: Response) => void) | null = null;
    const savePromise = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) return savePromise;
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) {
        return Response.json(
          wiredResponse({
            counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
            dossiers: [demoDossier],
          }),
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-my-secret-key" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    // Switch version WHILE the save's own POST is still unresolved.
    await act(async () => {
      rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);
    });

    // The save's POST finally resolves, late, after the switch above. Flush
    // several macrotask ticks so the dispatch-triggered refetch chain
    // (fetch resolve -> response.json() -> setData commit -> resolving
    // effect) has every chance to run before we assert.
    await act(async () => {
      resolveSave?.(Response.json({ success: true }));
      for (let i = 0; i < 6; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    // The version switch above also collapses the row (separate, pre-existing
    // reset), which alone would hide the receipt regardless of whether the
    // state bug this test targets is fixed. Re-expand it to check the actual
    // state, not the collapse: if `pendingSaveConfirmationRef` wrongly got
    // re-armed by the late completion, the receipt reappears right here.
    fireEvent.click(screen.getByRole("button", { name: /OpenAI Chat/i }));
    expect(screen.queryByText(/Previewn startas om/)).toBeNull();
  });

  it("does not resurrect the custom-key save confirmation if the version changes before the save's POST resolves", async () => {
    let resolveSave: ((value: Response) => void) | null = null;
    const savePromise = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) return savePromise;
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) return Response.json(wiredResponse());
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["MY_CUSTOM_SERVICE_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY");
    fireEvent.change(input, { target: { value: "real-secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    // Switch version WHILE the save's own POST is still unresolved.
    await act(async () => {
      rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);
    });

    // The save's POST finally resolves, late, after the switch above. Flush
    // several macrotask ticks so the dispatch-triggered refetch chain has
    // every chance to run before we assert.
    await act(async () => {
      resolveSave?.(Response.json({ success: true }));
      for (let i = 0; i < 6; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });

    expect(screen.queryByText(/Sparat\. Previewn startas om med de nya värdena\./)).toBeNull();
  });

  // Bugbot follow-up (4th pass on this diff): saveError/customError describe
  // ONE save attempt just as much as the success receipts above, but were
  // only ever reset on a full chat change -- a plain version switch (same
  // chat) left a failed-on-the-old-version message able to resurface.
  it("clears the dossier-row save error when only the version changes (not just the chat)", async () => {
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
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        return Response.json({ success: false, error: "Ogiltig nyckel." }, { status: 400 });
      }
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) {
        return Response.json(
          wiredResponse({
            counts: { total: 1, hard: 1, soft: 0, builtLive: 0, builtDemo: 1, blockedBuild: 0, planned: 0 },
            dossiers: [demoDossier],
          }),
        );
      }
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["OPENAI_API_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för OPENAI_API_KEY");
    fireEvent.change(input, { target: { value: "sk-my-secret-key" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    await waitFor(() => {
      expect(screen.getByText("Ogiltig nyckel.")).toBeTruthy();
    });

    // Same chat, new version: the error must not survive.
    rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);

    await waitFor(() => {
      expect(screen.queryByText("Ogiltig nyckel.")).toBeNull();
    });

    // The version switch also collapses the row (a separate, pre-existing
    // reset), which alone would hide the error regardless of whether
    // `saveError` itself got cleared. Re-expand it to check the actual
    // state, not the collapse.
    fireEvent.click(screen.getByRole("button", { name: /OpenAI Chat/i }));
    expect(screen.queryByText("Ogiltig nyckel.")).toBeNull();
  });

  it("clears the custom-key save error when only the version changes (not just the chat)", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/env-vars")) {
        return Response.json({ success: false, error: "Ogiltig nyckel." }, { status: 400 });
      }
      if (url.includes("/api/dossiers/catalog")) return Response.json(catalogResponse());
      if (url.includes("/dossiers")) return Response.json(wiredResponse());
      return Response.json({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(<PreviewPanelDossiers chatId="chat_1" versionId="ver_1" />);

    await act(async () => {
      openDossiersPanel(["MY_CUSTOM_SERVICE_KEY"]);
    });

    const input = await screen.findByLabelText("Värde för MY_CUSTOM_SERVICE_KEY");
    fireEvent.change(input, { target: { value: "real-secret-value" } });
    fireEvent.click(screen.getByRole("button", { name: /Spara och aktivera/i }));

    await waitFor(() => {
      expect(screen.getByText("Ogiltig nyckel.")).toBeTruthy();
    });

    // Same chat, new version: the error must not survive (not gated by row
    // expansion -- "Egna nycklar" is a fixed section, not a dossier row).
    rerender(<PreviewPanelDossiers chatId="chat_1" versionId="ver_2" />);

    await waitFor(() => {
      expect(screen.queryByText("Ogiltig nyckel.")).toBeNull();
    });
  });

  // Lucka 3 (ägarbeslut 2026-08-11): `builder-shell-content/` weaves these
  // counts into the F3-trigger's success title — this is the ONLY fetch of
  // `/dossiers`'s counts; `PreviewPanelF3Trigger` must never fetch it again.
  it("lucka 3: reports counts via onCountsChange on every fetch instead of a separate consumer fetch", async () => {
    stubFetch({
      wired: wiredResponse({
        counts: { total: 2, hard: 1, soft: 1, builtLive: 1, builtDemo: 0, blockedBuild: 0, planned: 1 },
      }),
    });
    const onCountsChange = vi.fn();

    render(
      <PreviewPanelDossiers chatId="chat_1" versionId="ver_1" onCountsChange={onCountsChange} />,
    );

    await waitFor(() => {
      expect(onCountsChange).toHaveBeenCalledWith(
        expect.objectContaining({ total: 2, builtLive: 1, builtDemo: 0 }),
      );
    });
  });
});
