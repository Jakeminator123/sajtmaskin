import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanelDossiers } from "./PreviewPanelDossiers";
import { dispatchVersionStatusRefreshed, openDossiersPanel } from "@/lib/builder/project-env-events";
import { stubFetch, wiredResponse } from "./PreviewPanelDossiers.test-support";

describe("PreviewPanelDossiers status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
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
    expect(screen.queryByText("Kopplad")).toBeNull();
    // Demoläget bor i den expanderade raden (där det finns plats för det).
    expect(screen.queryByText(/Demoläge: Medskickad demo-data/)).toBeNull();
    fireEvent.click(row);
    expect(screen.getByText("Kopplad")).toBeTruthy();
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
    expect(screen.getAllByText("Kopplad")).toHaveLength(2);
    expect(screen.getAllByText("Bygg integrationer")).toHaveLength(1);
  });

  // Owner decision 2026-07-13 (replaces the old catalog/status-only lock):
  // opening with env-key detail FOCUSES the dossier owning those keys and the
  // expanded row carries a masked write-only input for each missing key.
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

