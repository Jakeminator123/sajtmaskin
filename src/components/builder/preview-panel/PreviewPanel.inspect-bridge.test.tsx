import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./PreviewPanel";
import { usePreviewSurfaceMode } from "./usePreviewSurfaceMode";
import { INSPECT_BRIDGE_MESSAGE } from "@/lib/builder/inspect-bridge-feature";

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

const PREVIEW_A = "https://preview.example/ver_1";
const PREVIEW_B = "https://preview.example/ver_1?t=boot2";

function buildPreviewPanelProps(
  overrides?: Partial<React.ComponentProps<typeof PreviewPanel>>,
): React.ComponentProps<typeof PreviewPanel> {
  return {
    chatId: "chat_1",
    versionId: "ver_1",
    previewUrl: PREVIEW_A,
    onNavigatePreviewUrl: vi.fn(),
    onFilesSaved: vi.fn(),
    ...overrides,
  };
}

function attachFakeContentWindow(iframe: HTMLIFrameElement): Window {
  const fakeWindow = {} as Window;
  Object.defineProperty(iframe, "contentWindow", {
    configurable: true,
    get: () => fakeWindow,
  });
  return fakeWindow;
}

function postBridgeMessage(
  source: Window,
  type: string,
  payload?: Record<string, unknown>,
  identity?: { versionId: string; previewSessionId: string; lifecycleToken: string | null },
) {
  window.dispatchEvent(
    new MessageEvent("message", {
      source,
      origin: "null",
      data: {
        type,
        source: "sajtmaskin-inspect",
        ...(identity ? { identity } : {}),
        ...(payload ? { payload } : {}),
      },
    }),
  );
}

function InspectOnHarness(props: React.ComponentProps<typeof PreviewPanel>) {
  const surface = usePreviewSurfaceMode({
    previewUrl: props.previewUrl ?? null,
    canShowCode: Boolean(props.chatId && props.versionId),
    inspectorEnabled: true,
  });
  return <PreviewPanel {...props} surface={{ ...surface, inspectMode: true }} />;
}

describe("PreviewPanel inspect bridge recovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_INSPECT_BRIDGE", "1");
    vi.stubEnv("NEXT_PUBLIC_SAJTMASKIN_QUICK_EDIT", "");
    getBlocksByCategory.mockResolvedValue([]);
    getComponentsByCategory.mockResolvedValue([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: false, files: [], elements: [] }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("sen ready återupptar bridge", async () => {
    const view = render(<InspectOnHarness {...buildPreviewPanelProps()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    view.rerender(<InspectOnHarness {...buildPreviewPanelProps({ previewUrl: PREVIEW_B })} />);

    const iframe = document.getElementById("preview-iframe") as HTMLIFrameElement | null;
    expect(iframe).toBeTruthy();
    const contentWindow = attachFakeContentWindow(iframe!);

    await act(async () => {
      postBridgeMessage(contentWindow, INSPECT_BRIDGE_MESSAGE.ready);
    });

    await act(async () => {
      postBridgeMessage(contentWindow, INSPECT_BRIDGE_MESSAGE.pick, {
        tag: "button",
        text: "Köp nu",
        ownText: "Köp nu",
        childElementCount: 0,
        rect: { x: 40, y: 80, width: 120, height: 40 },
        viewport: { w: 1280, h: 800 },
        click: { x: 100, y: 100 },
      });
    });

    vi.useRealTimers();
    await waitFor(() => {
      expect(screen.getByRole("menu")).toBeTruthy();
    });
    expect(screen.getByText(/Valt: button/i)).toBeTruthy();
  }, 15000);

  it("fallbacken finns kvar", async () => {
    render(<InspectOnHarness {...buildPreviewPanelProps()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    vi.useRealTimers();
    await waitFor(() => {
      expect(screen.getByText("Inspektion aktiv")).toBeTruthy();
    });
  }, 15000);

  it("ett manuellt motorval rycks inte tillbaka av ett sent ready", async () => {
    render(<InspectOnHarness {...buildPreviewPanelProps()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    vi.useRealTimers();
    const aiButton = await waitFor(() =>
      screen.getByTitle("AI: gpt-5-mini analyserar koden"),
    );
    fireEvent.click(aiButton);
    await waitFor(() => {
      expect(screen.getByText(/AI identifierar elementet i koden/i)).toBeTruthy();
    });

    const iframe = document.getElementById("preview-iframe") as HTMLIFrameElement | null;
    expect(iframe).toBeTruthy();
    const contentWindow = attachFakeContentWindow(iframe!);

    await act(async () => {
      postBridgeMessage(contentWindow, INSPECT_BRIDGE_MESSAGE.ready);
    });

    expect(screen.getByText(/AI identifierar elementet i koden/i)).toBeTruthy();
  }, 15000);

  it("ett klick på den redan valda motorn släcker inte återhämtningen", async () => {
    render(<InspectOnHarness {...buildPreviewPanelProps()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    vi.useRealTimers();
    const mapButton = await waitFor(() =>
      screen.getByTitle("Map: forkompilerad elementkarta med hover"),
    );
    fireEvent.click(mapButton);

    const iframe = document.getElementById("preview-iframe") as HTMLIFrameElement | null;
    expect(iframe).toBeTruthy();
    const contentWindow = attachFakeContentWindow(iframe!);

    await act(async () => {
      postBridgeMessage(contentWindow, INSPECT_BRIDGE_MESSAGE.ready);
    });

    await waitFor(() => {
      expect(screen.queryByText("Inspektion aktiv")).toBeNull();
    });
  }, 15000);

  it("forged meddelande utan source-stämpel ignoreras (pick öppnas inte)", async () => {
    render(<InspectOnHarness {...buildPreviewPanelProps()} />);

    const iframe = document.getElementById("preview-iframe") as HTMLIFrameElement | null;
    expect(iframe).toBeTruthy();
    const contentWindow = attachFakeContentWindow(iframe!);

    await act(async () => {
      postBridgeMessage(contentWindow, INSPECT_BRIDGE_MESSAGE.ready);
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent("message", {
          source: contentWindow,
          origin: "null",
          data: {
            type: INSPECT_BRIDGE_MESSAGE.pick,
            // saknar source: "sajtmaskin-inspect"
            payload: {
              tag: "button",
              text: "Forged",
              rect: { x: 10, y: 10, width: 40, height: 20 },
              viewport: { w: 1280, h: 800 },
              click: { x: 20, y: 20 },
            },
          },
        }),
      );
    });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByText(/Valt: button/i)).toBeNull();
  }, 15000);

  it("ignorerar ready och pick från en äldre preview-lifecycle", async () => {
    render(
      <InspectOnHarness
        {...buildPreviewPanelProps({
          activePreviewSessionId: "ps_new",
          activePreviewLifecycleToken: "life_new",
        })}
      />,
    );

    const iframe = document.getElementById("preview-iframe") as HTMLIFrameElement | null;
    expect(iframe).toBeTruthy();
    const contentWindow = attachFakeContentWindow(iframe!);
    const pick = {
      tag: "button",
      text: "Gammal CTA",
      rect: { x: 10, y: 10, width: 80, height: 30 },
      viewport: { w: 1280, h: 800 },
      click: { x: 40, y: 20 },
    };

    await act(async () => {
      postBridgeMessage(contentWindow, INSPECT_BRIDGE_MESSAGE.ready, undefined, {
        versionId: "ver_old",
        previewSessionId: "ps_old",
        lifecycleToken: "life_old",
      });
      postBridgeMessage(contentWindow, INSPECT_BRIDGE_MESSAGE.pick, pick, {
        versionId: "ver_old",
        previewSessionId: "ps_old",
        lifecycleToken: "life_old",
      });
    });

    expect(screen.queryByRole("menu")).toBeNull();

    await act(async () => {
      postBridgeMessage(contentWindow, INSPECT_BRIDGE_MESSAGE.ready, undefined, {
        versionId: "ver_1",
        previewSessionId: "ps_new",
        lifecycleToken: "life_new",
      });
      postBridgeMessage(contentWindow, INSPECT_BRIDGE_MESSAGE.pick, pick, {
        versionId: "ver_1",
        previewSessionId: "ps_new",
        lifecycleToken: "life_new",
      });
    });

    vi.useRealTimers();
    await waitFor(() => expect(screen.getByRole("menu")).toBeTruthy());
  }, 15000);
});
