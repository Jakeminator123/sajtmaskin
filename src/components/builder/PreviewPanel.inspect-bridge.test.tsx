import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PreviewPanel } from "./preview-panel/PreviewPanel";
import { usePreviewSurfaceMode } from "./preview-panel/usePreviewSurfaceMode";
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

function postBridgeMessage(source: Window, type: string, payload?: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent("message", {
      source,
      origin: "null",
      data: {
        type,
        source: "sajtmaskin-inspect",
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
});
