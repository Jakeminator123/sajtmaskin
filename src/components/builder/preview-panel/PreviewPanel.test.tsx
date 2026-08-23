import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./PreviewPanel";
import { PreviewCodeViewMenu } from "./code/PreviewCodeViewMenu";
import { usePreviewSurfaceMode } from "./usePreviewSurfaceMode";
import { PreviewPanelFrame } from "./runtime/PreviewPanelFrame";
import {
  SHADCN_ITEM_DND_TYPE,
  serializeShadcnDragPayload,
  type ShadcnInsertSelection,
} from "@/lib/builder/shadcn-insert";
import type { SendMessageOutcome } from "@/lib/hooks/chat/types";
import type { ComponentCategory } from "@/lib/shadcn/registry-service";

vi.mock("@/lib/hooks/useIntegrationStatus", () => ({
  useIntegrationStatus: () => ({
    integrationStatus: null,
    integrationError: null,
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// next/dynamic → React.lazy så InspectorDev (placement-overlay) blir testbar.
vi.mock("next/dynamic", async () => {
  const ReactMod = await import("react");
  return {
    __esModule: true,
    default: (loader: () => Promise<{ default: React.ComponentType<unknown> }>) => {
      const Lazy = ReactMod.lazy(loader);
      return function DynamicTestWrapper(props: Record<string, unknown>) {
        return (
          <ReactMod.Suspense fallback={null}>
            <Lazy {...props} />
          </ReactMod.Suspense>
        );
      };
    },
  };
});

const { getBlocksByCategory, getComponentsByCategory } = vi.hoisted(() => ({
  getBlocksByCategory: vi.fn(),
  getComponentsByCategory: vi.fn(),
}));

vi.mock("@/lib/shadcn/registry-service", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/shadcn/registry-service")>();
  return { ...actual, getBlocksByCategory, getComponentsByCategory };
});

const BROWSE_BLOCK_CATEGORIES: ComponentCategory[] = [
  {
    id: "authentication",
    label: "Authentication",
    labelSv: "Inloggning",
    icon: "🔐",
    items: [
      {
        name: "login-01",
        title: "Login 01",
        description: "Enkelt inloggningsformulär",
        category: "authentication",
        type: "block",
        lightImageUrl: "https://ui.example/login-01-light.png",
      },
    ],
  },
];

function buildPreviewPanelProps(
  overrides?: Partial<React.ComponentProps<typeof PreviewPanel>>,
): React.ComponentProps<typeof PreviewPanel> {
  return {
    chatId: "chat_1",
    versionId: "ver_1",
    previewUrl: "https://preview.example/ver_1",
    onNavigatePreviewUrl: vi.fn(),
    onFilesSaved: vi.fn(),
    ...overrides,
  };
}

function renderPreviewPanel(overrides?: Partial<React.ComponentProps<typeof PreviewPanel>>) {
  return render(<PreviewPanel {...buildPreviewPanelProps(overrides)} />);
}

/**
 * Verktygen som styr previewytan bor utanför panelen sedan spår 04: `Kod` i
 * headerns kluster och `Lägg till block` i chatpanelens Verktyg-rad. Harnessen
 * speglar builderskalet — den äger lägena och renderar den riktiga Kod-menyn.
 * Composer-triggern är en stand-in för chatpanelens knapp (den täcks av
 * `ChatInterface.preview-modes.test.tsx`).
 */
function PreviewPanelHarness(props: React.ComponentProps<typeof PreviewPanel>) {
  const surface = usePreviewSurfaceMode({
    previewUrl: props.previewUrl ?? null,
    canShowCode: Boolean(props.chatId && props.versionId),
    inspectorEnabled: true,
  });
  return (
    <>
      <PreviewCodeViewMenu
        viewMode={surface.viewMode}
        canShowCode={surface.canShowCode}
        isViewSwitchPending={surface.isViewSwitchPending}
        onToggleCode={surface.toggleCodeView}
        onToggleElementRegistry={surface.toggleElementRegistry}
      />
      <button type="button" onClick={surface.toggleComposer}>
        Lägg till block
      </button>
      <PreviewPanel {...props} surface={surface} />
    </>
  );
}

function renderPreviewPanelWithTools(
  overrides?: Partial<React.ComponentProps<typeof PreviewPanel>>,
) {
  return render(<PreviewPanelHarness {...buildPreviewPanelProps(overrides)} />);
}

describe("PreviewPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Force the deterministic in-place PATCH save path these tests mock. Without
    // this, an ambient NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT=true (from .env.local or
    // a CI-injected env) routes the save through the Fast Edit Lane /quick-edit
    // call, which is NOT mocked here → the save rejects, onFilesSaved never
    // fires, and the save-flow waitFor times out (BUG-SWARM #261).
    vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT", "");
    getBlocksByCategory.mockResolvedValue(BROWSE_BLOCK_CATEGORIES);
    getComponentsByCategory.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows the actual awaiting-input question in the empty preview state", async () => {
    renderPreviewPanel({
      previewUrl: null,
      awaitingInput: true,
      awaitingInputQuestion: "Vilken del vill du att jag fokuserar på först?",
      awaitingInputOptions: ["Design", "Innehåll"],
    });

    await waitFor(() => {
      expect(screen.getByText("AI väntar på ditt svar")).toBeTruthy();
    });
    expect(
      screen.getByText("Vilken del vill du att jag fokuserar på först?"),
    ).toBeTruthy();
    expect(screen.getByText("Design")).toBeTruthy();
    expect(screen.getByText("Innehåll")).toBeTruthy();
  });

  it("shows a verification state while a saved version is still verifying", async () => {
    renderPreviewPanel({
      previewUrl: null,
      versionId: "ver_1",
      activeVersionStatus: "verifying",
      activeVersionSummary: "Automatic verification in progress.",
    });

    await waitFor(() => {
      expect(screen.getByText("Verifierar version")).toBeTruthy();
    });
    expect(screen.getByText("Automatic verification in progress.")).toBeTruthy();
  });

  it("shows a repaired-version handoff state instead of stale repairing", async () => {
    renderPreviewPanel({
      previewUrl: null,
      versionId: "ver_1",
      activeVersionStatus: "retrying",
      activeVersionSummary: "Superseded by repaired version ver_2.",
      activeVersionIsLatest: false,
    });

    await waitFor(() => {
      expect(screen.getByText("Byter till reparerad version")).toBeTruthy();
    });
    expect(screen.getByText("Superseded by repaired version ver_2.")).toBeTruthy();
  });

  it("keeps hook order stable when preview URL appears after the empty state", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: true, files: [], routes: [], elements: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const props = buildPreviewPanelProps({ previewUrl: null });
    const { rerender } = render(<PreviewPanel {...props} />);

    expect(() => {
      rerender(<PreviewPanel {...props} previewUrl="https://preview.example/ver_1" />);
    }).not.toThrow();
  });

  it("reloads the controlled route once when iframe SPA navigation moved elsewhere", async () => {
    vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_TIER2_PREVIEW_HOST_SUFFIXES", "preview.example");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            success: true,
            files: [
              { name: "app/page.tsx", content: '<a href="/about">About</a>' },
              { name: "app/about/page.tsx", content: "export default function About() {}" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const onNavigatePreviewUrl = vi.fn();
    renderPreviewPanel({
      previewUrl: "https://preview.example/chat_1",
      activePreviewSessionId: "session_1",
      previewLifecycle: "live",
      onNavigatePreviewUrl,
    });

    const homeButton = await screen.findByRole("button", { name: "/" });
    const aboutButton = screen.getByRole("button", { name: "/about" });
    const iframe = await screen.findByTitle("Preview") as HTMLIFrameElement;
    const viewerId = new URL(iframe.src).searchParams.get("__sm_viewer");
    expect(viewerId).toBeTruthy();

    window.dispatchEvent(
      new MessageEvent("message", {
        origin: "https://preview.example",
        source: iframe.contentWindow,
        data: {
          type: "sajtmaskin:preview:route-change",
          source: "sajtmaskin-preview-host",
          payload: {
            href: "https://preview.example/chat_1/about",
            previewSessionId: "session_1",
            versionId: "ver_1",
            viewerId,
          },
        },
      }),
    );
    await waitFor(() => {
      expect(aboutButton.parentElement?.className).toContain("border-sky-500/60");
    });

    const controlledSrc = iframe.getAttribute("src");
    expect(controlledSrc).toBeTruthy();
    const setSrc = vi.spyOn(iframe, "src", "set");

    fireEvent.click(aboutButton);
    expect(setSrc).not.toHaveBeenCalled();
    expect(onNavigatePreviewUrl).not.toHaveBeenCalled();

    fireEvent.click(homeButton);

    expect(setSrc).toHaveBeenCalledTimes(1);
    expect(setSrc).toHaveBeenCalledWith(controlledSrc);
    expect(onNavigatePreviewUrl).not.toHaveBeenCalled();
  });

  // Delat fetch-stub för drop-testerna: dossier-overviewn kräver sin riktiga
  // svarsform (counts/dossiers), övriga anrop får 404 → komponenternas egna
  // felvägar (aldrig en krasch som monterar ner drop-overlayn).
  function stubDropTestFetch() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/dossiers")) {
          return new Response(
            JSON.stringify({
              projectId: "proj_1",
              lifecycleStage: "design",
              counts: { total: 0, hard: 0, soft: 0 },
              dossiers: [],
              versionFilesAvailable: true,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/files")) {
          return new Response(JSON.stringify({ files: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({}), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
  }

  // Drop-vägen sätter placeringsankare via composer-overlay; klick-vägen
  // (Bläddra-detaljvy) använder samma fält via befintligt placeringsläge.
  it("forwards placement anchors to onShadcnItemInsert when a registry card drops on the composer overlay", async () => {
    stubDropTestFetch();
    const onShadcnItemInsert = vi.fn(
      async (_selection: ShadcnInsertSelection): Promise<SendMessageOutcome> => ({
        status: "started",
        via: "stream",
      }),
    );
    renderPreviewPanelWithTools({ onShadcnItemInsert });

    // Iframen laddar klart → drop-guarden (iframeLoading) släpper.
    fireEvent.load(screen.getByTitle("Preview"));
    fireEvent.click(screen.getByRole("button", { name: /Lägg till block/i }));

    const overlay = await screen.findByTestId("composer-drop-overlay");
    fireEvent.drop(overlay, {
      dataTransfer: {
        getData: (type: string) =>
          type === SHADCN_ITEM_DND_TYPE
            ? serializeShadcnDragPayload({
                name: "hero1",
                registry: "@shadcnblocks",
                title: "Hero 1",
                origin: "browse",
              })
            : "",
      },
    });

    await waitFor(() => {
      expect(onShadcnItemInsert).toHaveBeenCalledTimes(1);
    });
    // jsdom ger nollstor overlay-rect (y → 0) och inga sectionZones →
    // nearestInsertionPoint faller deterministiskt till "Längst upp".
    expect(onShadcnItemInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "hero1",
        registry: "@shadcnblocks",
        origin: "browse",
        placement: "top",
        placementLabel: "Längst upp",
      }),
    );
    expect(onShadcnItemInsert.mock.calls[0]?.[0]?.anchorSectionLabel).toBeUndefined();
  });

  it("ignores a drop with an unparsable registry payload without calling the insert lane", async () => {
    stubDropTestFetch();
    const onShadcnItemInsert = vi.fn(
      async (): Promise<SendMessageOutcome> => ({ status: "started", via: "stream" }),
    );
    renderPreviewPanelWithTools({ onShadcnItemInsert });

    fireEvent.load(screen.getByTitle("Preview"));
    fireEvent.click(screen.getByRole("button", { name: /Lägg till block/i }));

    const overlay = await screen.findByTestId("composer-drop-overlay");
    fireEvent.drop(overlay, {
      dataTransfer: {
        getData: (type: string) => (type === SHADCN_ITEM_DND_TYPE ? "{not json" : ""),
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("composer-drop-overlay")).toBeTruthy();
    });
    expect(onShadcnItemInsert).not.toHaveBeenCalled();
  });

  async function openBrowseDetailAndStartInsert(
    onShadcnItemInsert: (selection: ShadcnInsertSelection) => Promise<SendMessageOutcome>,
    overrides?: Partial<React.ComponentProps<typeof PreviewPanel>>,
  ) {
    vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL", "true");
    stubDropTestFetch();
    const view = renderPreviewPanelWithTools({ onShadcnItemInsert, ...overrides });

    fireEvent.load(screen.getByTitle("Preview"));
    fireEvent.click(screen.getByRole("button", { name: /Lägg till block/i }));

    // Add-panelen läser flaggan efter mount.
    await waitFor(() => screen.getByRole("tab", { name: /Bläddra/i }));
    fireEvent.click(screen.getByRole("tab", { name: /Bläddra/i }));
    await waitFor(() => screen.getByText("Login 01"));
    fireEvent.click(screen.getByText("Login 01"));
    fireEvent.click(screen.getByRole("button", { name: /Lägg till i sajten/i }));
    return view;
  }

  it("click-path Lägg till i sajten → placeringsläge → insert med ankare", async () => {
    const onShadcnItemInsert = vi.fn(
      async (_selection: ShadcnInsertSelection): Promise<SendMessageOutcome> => ({
        status: "started",
        via: "stream",
      }),
    );
    await openBrowseDetailAndStartInsert(onShadcnItemInsert);

    const overlay = await screen.findByTestId("placement-overlay");
    expect(onShadcnItemInsert).not.toHaveBeenCalled();

    // jsdom ger nollstor rect annars — handlePlacementClick tidig-returnerar.
    overlay.getBoundingClientRect = () =>
      ({
        width: 400,
        height: 600,
        top: 0,
        left: 0,
        bottom: 600,
        right: 400,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    fireEvent.click(overlay, { clientX: 200, clientY: 40 });

    await waitFor(() => {
      expect(onShadcnItemInsert).toHaveBeenCalledTimes(1);
    });
    // y≈6.7 % utan sectionZones → nearestInsertionPoint = "Längst upp".
    expect(onShadcnItemInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "login-01",
        registry: "@shadcn",
        origin: "browse",
        placement: "top",
        placementLabel: "Längst upp",
      }),
    );
  });

  // Esc = avbryt, inte "sätt in längst ner" — ett avbrutet val får aldrig
  // starta en generation (bugbot-fynd; samma kontrakt som klick utanför).
  it("click-path Esc under placeringsläge → ingen insättning alls", async () => {
    const onShadcnItemInsert = vi.fn(
      async (_selection: ShadcnInsertSelection): Promise<SendMessageOutcome> => ({
        status: "started",
        via: "stream",
      }),
    );
    await openBrowseDetailAndStartInsert(onShadcnItemInsert);

    await screen.findByTestId("placement-overlay");
    expect(onShadcnItemInsert).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByTestId("placement-overlay")).toBeNull();
    });
    expect(onShadcnItemInsert).not.toHaveBeenCalled();
  });

  // Bugbot-fynd på placement-pickern: ett chattbyte medan valet pågår får
  // varken fullfölja insättningen mot den nya chatten eller lämna
  // insertingRef/overlayn hängande — hela valet ska avbrytas tyst.
  it("click-path chattbyte under placeringsläge → ingen insättning alls", async () => {
    const onShadcnItemInsert = vi.fn(
      async (_selection: ShadcnInsertSelection): Promise<SendMessageOutcome> => ({
        status: "started",
        via: "stream",
      }),
    );
    const view = await openBrowseDetailAndStartInsert(onShadcnItemInsert);

    await screen.findByTestId("placement-overlay");
    expect(onShadcnItemInsert).not.toHaveBeenCalled();

    // Chattbyte medan placeringsvalet pågår.
    view.rerender(
      <PreviewPanelHarness
        {...buildPreviewPanelProps({ onShadcnItemInsert, chatId: "chat_2" })}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("placement-overlay")).toBeNull();
    });
    expect(onShadcnItemInsert).not.toHaveBeenCalled();
  });

  // Motsatsen till testet ovan: att versionslistan landar medan valet pågår är
  // ingen chattbyte. Placeringsläget kräver bara `previewUrl`, så avbryter
  // hydreringen valet försvinner overlayn tyst innan användaren hunnit klicka.
  it("click-path första versionshydreringen avbryter INTE placeringsvalet", async () => {
    const onShadcnItemInsert = vi.fn(
      async (_selection: ShadcnInsertSelection): Promise<SendMessageOutcome> => ({
        status: "started",
        via: "stream",
      }),
    );
    const view = await openBrowseDetailAndStartInsert(onShadcnItemInsert, {
      versionId: null,
    });

    await screen.findByTestId("placement-overlay");

    view.rerender(
      <PreviewPanelHarness
        {...buildPreviewPanelProps({ onShadcnItemInsert, versionId: "ver_1" })}
      />,
    );

    expect(screen.getByTestId("placement-overlay")).toBeTruthy();
    expect(onShadcnItemInsert).not.toHaveBeenCalled();
  });

  it("renders version mismatch overlay and exposes retry action", () => {
    const onPreviewSessionSuspect = vi.fn();

    renderPreviewPanel({
      onPreviewSessionSuspect,
      versionMismatchPayload: {
        chatId: "chat_1",
        expectedVersionId: "expected_ver_2",
        currentVersionId: "current_ver_1",
        msSinceMismatch: 12_000,
      },
    });

    const overlay = screen.getByTestId("version-mismatch-overlay");
    expect(within(overlay).getByText("Preview visar fel version")).toBeTruthy();
    expect(within(overlay).getByText("expected")).toBeTruthy();
    expect(within(overlay).getByText("current_")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Försök igen/i }));

    expect(onPreviewSessionSuspect).toHaveBeenCalledTimes(1);
  });

  it("adds one stable viewer id only to the embedded tier-2 URL", async () => {
    const canonicalUrl = "https://vm-test.fly.dev/chat_1";
    const view = renderPreviewPanel({
      previewUrl: canonicalUrl,
      activePreviewSessionId: "ps_1",
      previewLifecycle: "live",
      refreshToken: 1,
    });

    const iframe = (await screen.findByTitle("Preview")) as HTMLIFrameElement;
    let firstViewerId = "";
    await waitFor(() => {
      const embedded = new URL(iframe.getAttribute("src") || "", window.location.origin);
      firstViewerId = embedded.searchParams.get("__sm_viewer") || "";
      expect(firstViewerId).toMatch(
        /^smv_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(embedded.searchParams.get("__sm_refresh")).toBe("1");
      expect(embedded.searchParams.has("t")).toBe(false);
    });

    view.rerender(
      <PreviewPanel
        {...buildPreviewPanelProps({
          previewUrl: canonicalUrl,
          activePreviewSessionId: "ps_1",
          previewLifecycle: "live",
          refreshToken: 2,
        })}
      />,
    );
    await waitFor(() => {
      const reloaded = new URL(iframe.getAttribute("src") || "", window.location.origin);
      expect(reloaded.searchParams.get("__sm_refresh")).toBe("2");
      expect(reloaded.searchParams.get("__sm_viewer")).toBe(firstViewerId);
    });

    expect(canonicalUrl).not.toContain("__sm_viewer");
  });

  it("suppresses version mismatch overlay when iframe error is visible", () => {
    render(
      <PreviewPanelFrame
        isLoading={false}
        iframeError
        iframeErrorMessage="Iframe failed to load."
        iframeDiagnosticCode={null}
        iframeRunbookLines={[]}
        handleOpenInNewTab={vi.fn()}
        previewSrc="https://preview.example/ver_1"
        iframeRef={{ current: null }}
        handleIframeLoad={vi.fn()}
        handleIframeError={vi.fn()}
        versionMismatchPayload={{
          chatId: "chat_1",
          expectedVersionId: "expected_ver_2",
          currentVersionId: "current_ver_1",
          msSinceMismatch: 12_000,
        }}
      />,
    );

    expect(screen.queryByTestId("version-mismatch-overlay")).toBeNull();
    expect(screen.getByText("Iframe failed to load.")).toBeTruthy();
  });

  it("shows the footer editor and not the nav editor for footer link files", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/engine/chats/chat_1/files?versionId=ver_1")) {
          return new Response(
            JSON.stringify({
              files: [
                {
                  name: "components/site-footer.tsx",
                  content: [
                    "const footerLinks = {",
                    "  Tjänster: [",
                    "    { label: 'Webbdesign', href: '#' },",
                    "    { label: 'SEO', href: '#' },",
                    "  ],",
                    "  Företaget: [",
                    "    { label: 'Om oss', href: '#' },",
                    "    { label: 'Kontakt', href: '#' },",
                    "  ],",
                    "};",
                    "export function SiteFooter() { return null; }",
                  ].join("\n"),
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    renderPreviewPanelWithTools();
    fireEvent.click(screen.getByRole("button", { name: /^Kod$/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Kodvy/i }));

    await waitFor(() => {
      expect(screen.getByText("Footereditor")).toBeTruthy();
    });

    expect(screen.queryByText("Navigationeditor")).toBeNull();
    expect(screen.getByDisplayValue("Tjänster")).toBeTruthy();
    expect(screen.getByDisplayValue("Webbdesign")).toBeTruthy();
  });

  it("shows the blog post editor for blog post arrays in code view", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/engine/chats/chat_1/files?versionId=ver_1")) {
          return new Response(
            JSON.stringify({
              files: [
                {
                  name: "app/blog/page.tsx",
                  content: [
                    "const posts = [",
                    "  { slug: 'post-1', title: 'Post ett', excerpt: 'Kort sammanfattning ett.', date: '2026-03-10', author: 'Alex', category: 'Guide' },",
                    "  { slug: 'post-2', title: 'Post två', excerpt: 'Kort sammanfattning två.', date: '2026-03-09', author: 'Alex', category: 'Nyheter' },",
                    "];",
                    "export default function BlogPage() { return null; }",
                  ].join("\n"),
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    renderPreviewPanelWithTools();
    fireEvent.click(screen.getByRole("button", { name: /^Kod$/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Kodvy/i }));

    await waitFor(() => {
      expect(screen.getByText("Inläggseditor")).toBeTruthy();
    });

    expect(screen.getByDisplayValue("Post ett")).toBeTruthy();
    expect(screen.getByDisplayValue("Kort sammanfattning ett.")).toBeTruthy();
  });

  it("saves footer editor changes through the files PATCH route", async () => {
    const onFilesSaved = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/engine/chats/chat_1/files?versionId=ver_1")) {
        return new Response(
          JSON.stringify({
            files: [
              {
                name: "components/site-footer.tsx",
                content: [
                  "const footerLinks = {",
                  "  Tjänster: [",
                  "    { label: 'Webbdesign', href: '#' },",
                  "    { label: 'SEO', href: '#' },",
                  "  ],",
                  "  Företaget: [",
                  "    { label: 'Om oss', href: '#' },",
                  "    { label: 'Kontakt', href: '#' },",
                  "  ],",
                  "};",
                  "export function SiteFooter() { return null; }",
                ].join("\n"),
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/engine/chats/chat_1/files") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPreviewPanelWithTools({ onFilesSaved });
    fireEvent.click(screen.getByRole("button", { name: /^Kod$/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Kodvy/i }));

    await waitFor(() => {
      expect(screen.getByText("Footereditor")).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue("Webbdesign"), {
      target: { value: "UX-design" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Spara footer/i }));

    await waitFor(() => {
      expect(onFilesSaved).toHaveBeenCalledTimes(1);
    });

    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/engine/chats/chat_1/files") && init?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();

    const patchBody = JSON.parse(String(patchCall?.[1]?.body ?? "{}")) as {
      fileName?: string;
      versionId?: string;
      content?: string;
    };
    expect(patchBody.fileName).toBe("components/site-footer.tsx");
    expect(patchBody.versionId).toBe("ver_1");
    expect(patchBody.content).toContain("label: 'UX-design'");
  });

  it("saves blog post editor changes through the files PATCH route", async () => {
    const onFilesSaved = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/engine/chats/chat_1/files?versionId=ver_1")) {
        return new Response(
          JSON.stringify({
            files: [
              {
                name: "app/blog/page.tsx",
                content: [
                  "const posts = [",
                  "  { slug: 'post-1', title: 'Post ett', excerpt: 'Kort sammanfattning ett.', date: '2026-03-10', author: 'Alex', category: 'Guide' },",
                  "  { slug: 'post-2', title: 'Post två', excerpt: 'Kort sammanfattning två.', date: '2026-03-09', author: 'Alex', category: 'Nyheter' },",
                  "];",
                  "export default function BlogPage() { return null; }",
                ].join("\n"),
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      if (url.endsWith("/api/engine/chats/chat_1/files") && init?.method === "PATCH") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderPreviewPanelWithTools({ onFilesSaved });
    fireEvent.click(screen.getByRole("button", { name: /^Kod$/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Kodvy/i }));

    await waitFor(() => {
      expect(screen.getByText("Inläggseditor")).toBeTruthy();
    });

    fireEvent.change(screen.getByDisplayValue("Post ett"), {
      target: { value: "Ny titel ett" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Spara inlägg/i }));

    await waitFor(() => {
      expect(onFilesSaved).toHaveBeenCalledTimes(1);
    });

    const patchCall = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input).endsWith("/api/engine/chats/chat_1/files") && init?.method === "PATCH",
    );
    expect(patchCall).toBeTruthy();

    const patchBody = JSON.parse(String(patchCall?.[1]?.body ?? "{}")) as {
      fileName?: string;
      versionId?: string;
      content?: string;
    };
    expect(patchBody.fileName).toBe("app/blog/page.tsx");
    expect(patchBody.versionId).toBe("ver_1");
    expect(patchBody.content).toContain("title: 'Ny titel ett'");
  });
});
