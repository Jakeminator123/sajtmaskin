import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./preview-panel/PreviewPanel";
import { PreviewPanelFrame } from "./preview-panel/PreviewPanelFrame";

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

describe("PreviewPanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Force the deterministic in-place PATCH save path these tests mock. Without
    // this, an ambient NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT=true (from .env.local or
    // a CI-injected env) routes the save through the Fast Edit Lane /quick-edit
    // call, which is NOT mocked here → the save rejects, onFilesSaved never
    // fires, and the save-flow waitFor times out (BUG-SWARM #261).
    vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT", "");
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

    renderPreviewPanel();
    fireEvent.click(screen.getByRole("button", { name: /Kodvy/i }));

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

    renderPreviewPanel();
    fireEvent.click(screen.getByRole("button", { name: /Kodvy/i }));

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

    renderPreviewPanel({ onFilesSaved });
    fireEvent.click(screen.getByRole("button", { name: /Kodvy/i }));

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

    renderPreviewPanel({ onFilesSaved });
    fireEvent.click(screen.getByRole("button", { name: /Kodvy/i }));

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
