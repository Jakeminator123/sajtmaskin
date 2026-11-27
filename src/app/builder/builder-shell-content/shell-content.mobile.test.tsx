import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetBuilderCubePreferenceForTests,
  setBuilderCubeEnabled,
} from "@/lib/builder/builder-cube-preference";
import { CUBE_LAYOUT_STORAGE_KEY, defaultCubeLayout } from "@/components/builder/cube/cube-layout-storage";
import type { BuilderViewModel } from "../useBuilderPageController";

const lifecycle = vi.hoisted(() => ({ mount: vi.fn(), unmount: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/builder/chat/ChatInterface", async () => {
  const { useEffect } = await import("react");
  return {
    ChatInterface: ({ onTurnSent }: { onTurnSent: () => void }) => {
      useEffect(() => {
        lifecycle.mount();
        return () => lifecycle.unmount();
      }, []);
      return <>
        <textarea aria-label="Skriv till Sajtagenten" data-openclaw-text-target="builder.chat.primary" />
        <button onClick={onTurnSent}>Skicka provmeddelande</button>
      </>;
    },
  };
});
vi.mock("@/components/builder/chat/MessageList", () => ({
  MessageList: () => <div data-testid="shell-timeline">Chatthistorik</div>,
}));
vi.mock("@/components/builder/preview-panel/PreviewPanel", () => ({
  PreviewPanel: () => <div data-testid="shell-preview">Sajtens förhandsvisning</div>,
}));
vi.mock("@/components/builder/shell/BuilderHeader", () => ({ BuilderHeader: () => <header>Byggaren</header> }));
vi.mock("@/components/builder/shell/BuilderPreviewTools", () => ({ BuilderPreviewTools: () => null }));
vi.mock("@/components/builder/diagnostics/ModelTraceOverlay", () => ({ ModelTraceOverlay: () => null }));
vi.mock("@/components/kostnadsfri/campaign-account-banner", () => ({ CampaignAccountBanner: () => null }));
vi.mock("@/components/auth/require-auth-modal", () => ({ RequireAuthModal: () => null }));
vi.mock("@/components/builder/chat/sajtagent/SajtagentProvider", () => ({
  SajtagentProvider: ({ children }: { children: ReactNode }) => children,
  useSajtagent: () => null,
}));
vi.mock("@/components/builder/chat/sajtagent/SajtagentAvatar", () => ({ SajtagentAvatar: () => <div>Avatar</div> }));
vi.mock("@/components/builder/cube/faces/CubeBuildLogFace", () => ({ CubeBuildLogFace: () => <div>Byggstatus</div> }));
vi.mock("@/components/builder/cube/faces/CubeToolsFace", () => ({ CubeToolsFace: () => <div>Modell och byggval</div> }));
vi.mock("@/components/builder/cube/faces/CubeSitemapFace", () => ({
  CubeSitemapFace: ({ visible, onNavigate }: { visible: boolean; onNavigate?: () => void }) => (
    <div data-testid="shell-sitemap" data-visible={visible}>
      <button onClick={onNavigate}>Öppna Om sajten</button>
    </div>
  ),
}));
vi.mock("./shell-dialogs", () => ({ BuilderShellDialogs: () => null }));
vi.mock("./use-version-followup", () => ({
  useShellVersionFollowup: () => ({
    isBusy: false, isInteractionLocked: false, isPreviewLoading: false,
    activeVersionStatusIdentity: null, activeVersionStatus: null, preferredVersionStatus: null,
    sendMessage: vi.fn(), handleComposerAiFallback: vi.fn(),
  }),
}));
vi.mock("./use-deploy-domain", () => ({ useShellDeployDomain: () => ({ canDeploy: false, hasPublication: false, authUser: null }) }));
vi.mock("./use-dev-context-effects", () => ({ useShellDevContextEffects: () => {} }));
vi.mock("./use-registry-insert", () => ({ useShellRegistryInsert: () => ({ latestPendingReply: null }) }));
vi.mock("./use-f3-tips-chrome", async () => {
  const { useState } = await import("react");
  return {
    useShellF3TipsChrome: () => {
      const [mobileTab, setMobileTab] = useState("chat");
      return { mobileTab, setMobileTab, visibleF3Status: null, visibleF3Requirements: null };
    },
  };
});
vi.mock("./use-preview-layout", async (original) => ({
  ...await original<typeof import("./use-preview-layout")>(),
  useShellPreviewLayout: () => ({
    previewSurface: { inspectMode: false, setInspectMode: vi.fn() },
    chatOutputCollapse: { expand: vi.fn(), toggle: vi.fn() },
    isChatOutputCollapsed: false,
  }),
}));

import { BuilderShellContent } from "./shell-content";

function viewModel(chatId: string | null = "local-chat"): BuilderViewModel {
  return {
    chatId, activeVersionId: "v1", messages: [{ id: "u1", role: "user", content: "En sajt" }],
    currentPreviewUrl: "https://example.test", effectiveVersionsList: [], isVersionPanelCollapsed: true,
    isImportModalOpen: false, isAnyStreaming: false, authModalReason: null,
    selectedModelTier: "pro", enableImageGenerations: false, enableThinking: false,
    setSelectedModelTier: vi.fn(), setTipsEnabled: vi.fn(), setEnableThinking: vi.fn(),
    setEnableImageGenerations: vi.fn(), setCurrentPreviewUrl: vi.fn(), previewRefreshToken: 0,
  } as unknown as BuilderViewModel;
}

function mobileViewport(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("prefers-reduced-motion") || (query.includes("max-width") && width < 640),
    media: query, addEventListener: () => {}, removeEventListener: () => {},
  }));
}

beforeEach(() => {
  localStorage.clear();
  resetBuilderCubePreferenceForTests();
  lifecycle.mount.mockClear();
  lifecycle.unmount.mockClear();
});
afterEach(() => {
  resetBuilderCubePreferenceForTests();
  vi.unstubAllGlobals();
});

describe("BuilderShellContent mobile cube entry", () => {
  it.each([360, 900])("opens all six views at %i px and preserves one composer through preview and opt-out", (width) => {
    mobileViewport(width);
    setBuilderCubeEnabled(true);
    localStorage.setItem(CUBE_LAYOUT_STORAGE_KEY, JSON.stringify({ ...defaultCubeLayout(), mode: "cards" }));
    render(<BuilderShellContent {...viewModel()} />);
    const views = () => within(screen.getByRole("tablist", { name: "Sidor" }));
    expect(views().getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Chatt", "Svar", "Bygglogg", "Verktyg", "Avatar", "Sajtkarta",
    ]);
    expect(document.querySelector('[data-cube-mode="tabs"]')).toBeTruthy();
    const composer = screen.getByLabelText("Skriv till Sajtagenten") as HTMLTextAreaElement;
    const timeline = screen.getByTestId("shell-timeline");
    fireEvent.change(composer, { target: { value: "Mitt mobilutkast" } });
    fireEvent.click(screen.getByRole("button", { name: "Skicka provmeddelande" }));
    expect(views().getByRole("tab", { name: "Svar" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(views().getByRole("tab", { name: "Sajtkarta" }));
    expect(screen.getByTestId("shell-sitemap").dataset.visible).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Öppna Om sajten" }));
    expect(screen.getByRole("tab", { name: "Förhandsvisning" }).getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("builder-chat-panel")?.classList.contains("hidden")).toBe(true);
    expect(document.getElementById("builder-preview-panel")?.classList.contains("flex")).toBe(true);
    expect(screen.getByTestId("shell-sitemap").dataset.visible).toBe("false");
    const outerTabs = within(screen.getByRole("tablist", { name: "Byggarvyer" }));
    fireEvent.click(outerTabs.getByRole("tab", { name: "Byggvyer" }));
    expect(screen.getByTestId("shell-sitemap").dataset.visible).toBe("true");
    fireEvent.click(views().getByRole("tab", { name: "Chatt" }));
    expect(screen.getByLabelText("Skriv till Sajtagenten")).toBe(composer);
    expect(composer.value).toBe("Mitt mobilutkast");
    expect(document.querySelectorAll("textarea")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Vanlig chatt" }));
    expect(screen.queryByRole("region", { name: "Byggkuben" })).toBeNull();
    expect(screen.getByLabelText("Skriv till Sajtagenten")).toBe(composer);
    fireEvent.click(screen.getByRole("button", { name: "Öppna byggkuben" }));
    expect(screen.getByRole("region", { name: "Byggkuben" })).toBeTruthy();
    expect(screen.getByLabelText("Skriv till Sajtagenten")).toBe(composer);
    expect(screen.getByTestId("shell-timeline")).toBe(timeline);
    expect(lifecycle.mount).toHaveBeenCalledTimes(1);
    expect(lifecycle.unmount).not.toHaveBeenCalled();
  });

  it.each([false, true])("keeps the initial composer available with cube preference %s", (cubeEnabled) => {
    mobileViewport(360);
    setBuilderCubeEnabled(cubeEnabled);
    render(<BuilderShellContent {...viewModel(null)} />);
    expect(screen.getAllByLabelText("Skriv till Sajtagenten")).toHaveLength(1);
    expect(screen.queryByRole("region", { name: "Byggkuben" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Öppna byggkuben" })).toBeNull();
  });

  it("respects an explicit cube opt-out after loading a chat", () => {
    mobileViewport(360);
    render(<BuilderShellContent {...viewModel()} />);
    expect(screen.queryByRole("region", { name: "Byggkuben" })).toBeNull();
    expect(screen.getAllByLabelText("Skriv till Sajtagenten")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Öppna byggkuben" })).toBeTruthy();
  });
});
