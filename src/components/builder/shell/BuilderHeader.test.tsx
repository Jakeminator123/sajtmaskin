// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
const agent = vi.hoisted(() => ({
  configured: true,
  fastMode: undefined as { enabled: boolean; setEnabled: (enabled: boolean) => void } | undefined,
}));
vi.mock("@/components/builder/chat/sajtagent/SajtagentProvider", () => ({
  useSajtagent: () => agent,
}));
vi.mock("@/lib/auth/auth-store", () => ({
  useAuth: () => ({ isAuthenticated: true, logout: vi.fn() }),
}));

import { BuilderHeader } from "./BuilderHeader";
import { useOpenClawStore } from "@/lib/openclaw/openclaw-store";
import { useComposerMode } from "@/lib/builder/use-composer-mode";

type HeaderProps = React.ComponentProps<typeof BuilderHeader>;

function stubViewport(desktop: boolean): () => void {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query === "(min-width: 1024px)" ? desktop : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

function props(overrides: Partial<HeaderProps> = {}): HeaderProps {
  return {
    scaffoldMode: "auto",
    scaffoldId: null,
    onScaffoldModeChange: vi.fn(),
    onScaffoldIdChange: vi.fn(),
    customInstructions: "",
    onCustomInstructionsChange: vi.fn(),
    applyInstructionsOnce: false,
    onApplyInstructionsOnceChange: vi.fn(),
    enableImageGenerations: false,
    onEnableImageGenerationsChange: vi.fn(),
    enableThinking: false,
    onEnableThinkingChange: vi.fn(),
    isImageGenerationsSupported: true,
    isMediaEnabled: true,
    chatPrivacy: "private",
    onChatPrivacyChange: vi.fn(),
    enableBlobMedia: false,
    onEnableBlobMediaChange: vi.fn(),
    enableAutofix: true,
    onEnableAutofixChange: vi.fn(),
    showStructuredChat: false,
    onShowStructuredChatChange: vi.fn(),
    tipsEnabled: true,
    onTipsEnabledChange: vi.fn(),
    isFigmaInputOpen: false,
    onToggleFigmaInput: vi.fn(),
    chatId: "chat_1",
    activeVersionId: "ver_1",
    onOpenImport: vi.fn(),
    onExportGitHub: vi.fn(),
    onDeployProduction: vi.fn(),
    onDomainSearch: vi.fn(),
    onGoHome: vi.fn(),
    onNewChat: vi.fn(),
    onSaveProject: vi.fn(),
    onCancelGeneration: vi.fn(),
    isDeploying: false,
    isCreatingChat: false,
    isAnyStreaming: false,
    isSavingProject: false,
    canDeploy: true,
    canManageDomain: true,
    canSaveProject: true,
    previewTools: <div aria-label="Previewverktyg" />,
    ...overrides,
  };
}

function openMoreMenu() {
  const trigger = screen.getByRole("button", { name: /^Mer —/ });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return trigger;
}

describe("BuilderHeader", () => {
  let restoreViewport: (() => void) | undefined;

  afterEach(() => {
    cleanup();
    agent.fastMode = undefined;
    sessionStorage.clear();
    useOpenClawStore.setState({ editEnabled: false, armedMandate: null, powersOn: false, grantedPowers: [] });
    restoreViewport?.();
    restoreViewport = undefined;
  });

  it("är en rad på mobil: logotyp, Mer och Publicera; resten bor i Mer (V-10)", () => {
    restoreViewport = stubViewport(false);
    const onNewChat = vi.fn();
    const onOpenVersionHistory = vi.fn();
    render(<BuilderHeader {...props({ onNewChat, onOpenVersionHistory })} />);

    expect(screen.getByRole("button", { name: "Sajtmaskin — gå till startsidan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publicera" })).toBeTruthy();
    expect(screen.queryByLabelText("Previewverktyg")).toBeNull();
    expect(screen.queryByRole("button", { name: /Ny chatt/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Logga ut/ })).toBeNull();

    openMoreMenu();
    expect(screen.getByRole("menuitem", { name: "Ny chatt" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Versionshistorik" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Logga ut" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Spara projekt" })).toBeTruthy();
  });

  it("öppnar versionshistoriken från Mer på mobil (§ 9)", () => {
    restoreViewport = stubViewport(false);
    const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    try {
      const onOpenVersionHistory = vi.fn();
      render(<BuilderHeader {...props({ onOpenVersionHistory })} />);
      openMoreMenu();
      fireEvent.click(screen.getByRole("menuitem", { name: "Versionshistorik" }));
      expect(onOpenVersionHistory).toHaveBeenCalledOnce();
    } finally {
      raf.mockRestore();
    }
  });

  it("behåller avbryt-knappen synlig på mobil medan något körs", () => {
    restoreViewport = stubViewport(false);
    render(<BuilderHeader {...props({ isAnyStreaming: true })} />);
    expect(screen.getByRole("button", { name: "Avbryt pågående generering" })).toBeTruthy();
  });

  it("kan välja Fråga i Inställningar mitt i ett bygge och återkallar automation direkt", () => {
    restoreViewport = stubViewport(true);
    useOpenClawStore.setState({ armedMandate: { mode: "followups", reason: "Test", remaining: 1, createdAt: 1 } });
    function HeaderWithMode() {
      const { composerMode, handleComposerModeChange } = useComposerMode("chat_1");
      return <BuilderHeader {...props({ isAnyStreaming: true, composerSettings: {
        mode: composerMode, buildLocked: true, onModeChange: handleComposerModeChange,
      } })} />;
    }
    render(<HeaderWithMode />);
    openMoreMenu();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Inställningar" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Chattläge · Auto" }), { key: "ArrowRight" });
    expect(screen.getByRole("menuitemradio", { name: "Bygg" }).getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Fråga" }));
    expect(useOpenClawStore.getState().armedMandate).toBeNull();
    expect(sessionStorage.getItem("sajtmaskin:composerMode:chat_1")).toBe("agent");
  });

  it("lets the user opt in to OpenAI Fast from Settings on mobile", () => {
    restoreViewport = stubViewport(false);
    const setEnabled = vi.fn();
    agent.fastMode = { enabled: false, setEnabled };
    render(<BuilderHeader {...props()} />);
    openMoreMenu();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Inställningar" }), { key: "ArrowRight" });
    const item = screen.getByRole("menuitemcheckbox", { name: /Snabbare svar från Sajtagenten.*dubbelt tokenpris/ });
    expect(item.getAttribute("aria-checked")).toBe("false");
    fireEvent.keyDown(item, { key: "Enter" });
    expect(setEnabled).toHaveBeenCalledWith(true);
  });

  it("visar sköldens tre val med samma huvudspärr i Inställningar", () => {
    restoreViewport = stubViewport(true);
    useOpenClawStore.setState({ editEnabled: true, powersOn: true, grantedPowers: ["quick_edit"] });
    render(<BuilderHeader {...props()} />);
    openMoreMenu();
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Inställningar" }), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("menuitem", { name: "Sajtagentens befogenheter" }), { key: "ArrowRight" });
    expect(screen.getByRole("menuitemcheckbox", { name: /Snabbändringar/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("menuitemcheckbox", { name: /Agerar direkt/ })).toBeTruthy();
    expect(screen.getByRole("menuitemcheckbox", { name: /Granskar sajten live/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Låt agenten ändra" }));
    expect(useOpenClawStore.getState().powersOn).toBe(false);
    expect(screen.getByRole("menuitemcheckbox", { name: /Snabbändringar/ }).getAttribute("aria-disabled")).toBe("true");
  });

  it("behåller desktopheadern: previewverktyg, Ny chatt och Logga ut som knappar", () => {
    restoreViewport = stubViewport(true);
    render(<BuilderHeader {...props({ onOpenVersionHistory: vi.fn() })} />);

    expect(screen.getByLabelText("Previewverktyg")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ny chatt/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Logga ut/ })).toBeTruthy();

    openMoreMenu();
    expect(screen.queryByRole("menuitem", { name: "Versionshistorik" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Ny chatt" })).toBeNull();
  });
});
