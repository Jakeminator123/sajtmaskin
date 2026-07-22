/**
 * A4: felstate + byggloggslänk i BuilderHeader när en publicering failat
 * asynkront (Vercel-build-fel).
 *
 * Täcker:
 * - `deploymentStatus === "error"` visar en tydlig felindikator
 *   ("Publiceringen misslyckades") oavsett om `inspectorUrl` finns.
 * - `deploymentInspectorUrl` renderas som en `target="_blank"` /
 *   `rel="noopener noreferrer"`-länk när den finns.
 * - Ingen byggloggslänk renderas när `deploymentInspectorUrl` saknas.
 * - Felstaten dubblerar inte A3:s "Publicera om med fix"-knapp — båda kan
 *   samexistera.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { BuilderHeader } from "./BuilderHeader";

type BuilderHeaderProps = React.ComponentProps<typeof BuilderHeader>;

function baseProps(overrides: Partial<BuilderHeaderProps> = {}): BuilderHeaderProps {
  return {
    selectedModelTier: "pro",
    onSelectedModelTierChange: () => {},
    onApplyAnthropicComparePreset: () => {},

    promptAssistModel: "off",
    promptAssistDeep: false,
    canUseDeepBrief: true,

    scaffoldMode: "auto",
    scaffoldId: null,
    onScaffoldModeChange: () => {},
    onScaffoldIdChange: () => {},

    customInstructions: "",
    onCustomInstructionsChange: () => {},
    applyInstructionsOnce: false,
    onApplyInstructionsOnceChange: () => {},

    enableImageGenerations: false,
    onEnableImageGenerationsChange: () => {},
    enableThinking: false,
    onEnableThinkingChange: () => {},
    isImageGenerationsSupported: true,
    isMediaEnabled: true,
    chatPrivacy: "private",
    onChatPrivacyChange: () => {},
    enableBlobMedia: false,
    onEnableBlobMediaChange: () => {},
    enableAutofix: true,
    onEnableAutofixChange: () => {},

    showStructuredChat: false,
    onShowStructuredChatChange: () => {},
    tipsEnabled: false,
    onTipsEnabledChange: () => {},
    isFigmaInputOpen: false,
    onToggleFigmaInput: () => {},

    chatId: "chat_1",
    activeVersionId: "ver_1",

    onOpenImport: () => {},
    onExportGitHub: () => {},
    onDeployProduction: () => {},
    onDomainSearch: () => {},
    onGoHome: () => {},
    onNewChat: () => {},
    onSaveProject: () => {},
    onCancelGeneration: () => {},

    isDeploying: false,
    isCreatingChat: false,
    isAnyStreaming: false,
    isSavingProject: false,
    canDeploy: true,
    canManageDomain: true,
    canSaveProject: true,
    ...overrides,
  };
}

describe("BuilderHeader deploy-felstate (A4)", () => {
  it("visar ingen felstate när publiceringen inte har failat", () => {
    render(<BuilderHeader {...baseProps({ deploymentStatus: "ready" })} />);
    expect(screen.queryByText(/Publiceringen misslyckades/i)).toBeNull();
    expect(screen.queryByText(/Visa byggloggar/i)).toBeNull();
  });

  it("visar felstate utan byggloggslänk när inspectorUrl saknas", () => {
    render(
      <BuilderHeader
        {...baseProps({
          deploymentStatus: "error",
          deploymentInspectorUrl: null,
        })}
      />,
    );
    expect(screen.getByText(/Publiceringen misslyckades/i)).toBeTruthy();
    expect(screen.queryByText(/Visa byggloggar/i)).toBeNull();
  });

  it("visar byggloggslänk (target=_blank, rel=noopener noreferrer) när inspectorUrl finns", () => {
    render(
      <BuilderHeader
        {...baseProps({
          deploymentStatus: "error",
          deploymentInspectorUrl: "https://vercel.com/team/project/deployments/dpl_123",
        })}
      />,
    );
    expect(screen.getByText(/Publiceringen misslyckades/i)).toBeTruthy();
    const link = screen.getByRole("link", { name: /Visa byggloggar/i });
    expect(link.getAttribute("href")).toBe(
      "https://vercel.com/team/project/deployments/dpl_123",
    );
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("visar felstaten samtidigt som A3:s 'Publicera om med fix'-knapp, utan att dubblera den", () => {
    render(
      <BuilderHeader
        {...baseProps({
          deploymentStatus: "error",
          deploymentInspectorUrl: "https://vercel.com/team/project/deployments/dpl_123",
          onRepublishWithFix: () => {},
        })}
      />,
    );
    expect(screen.getByText(/Publiceringen misslyckades/i)).toBeTruthy();
    expect(screen.getAllByText(/Publicera om med fix/i)).toHaveLength(1);
  });
});
