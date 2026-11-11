import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Controllable stand-in for the URL params the component reads via
// `useSearchParams` (template entries suppress the onboarding welcome).
const searchParamsMock = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.current,
}));

import { PreviewPanelEmptyState } from "./PreviewPanelEmptyState";
import { beginF3Finalize, resetF3FinalizeActivity } from "@/lib/builder/repair-blocked";
import { publishWelcomeComposer } from "@/lib/builder/welcome-composer-bridge";

const FIX_LABEL = "Försök reparera preview";
const WELCOME_TITLE = "Vad vill du bygga?";

function renderEmptyState(
  props: Partial<React.ComponentProps<typeof PreviewPanelEmptyState>> = {},
) {
  return render(
    <PreviewPanelEmptyState
      // `undefined` → default; explicit `null` must pass through (empty start).
      chatId={props.chatId === undefined ? "chat_1" : props.chatId}
      versionId={props.versionId === undefined ? "ver_1" : props.versionId}
      externalLoading={props.externalLoading ?? false}
      awaitingInput={props.awaitingInput ?? false}
      awaitingInputOptions={props.awaitingInputOptions ?? []}
      previewPending={props.previewPending ?? false}
      onFixPreview={props.onFixPreview ?? vi.fn()}
      isGenerating={props.isGenerating ?? false}
      templateInitError={props.templateInitError ?? null}
      onRetryTemplateInit={props.onRetryTemplateInit ?? null}
      hasPrefilledPrompt={props.hasPrefilledPrompt ?? false}
      designTheme={props.designTheme}
      onDesignThemeChange={props.onDesignThemeChange}
      activeVersionStatus={props.activeVersionStatus}
      previewLifecycle={props.previewLifecycle}
    />,
  );
}

afterEach(() => {
  resetF3FinalizeActivity();
  searchParamsMock.current = new URLSearchParams();
  publishWelcomeComposer(null);
});

describe("PreviewPanelEmptyState — reparationsgrind", () => {
  it("erbjuder reparation när inget annat pågår", () => {
    renderEmptyState();
    expect(screen.getByRole("button", { name: FIX_LABEL })).toBeTruthy();
  });

  it("döljer reparationen under en generering", () => {
    renderEmptyState({ isGenerating: true });
    expect(screen.queryByRole("button", { name: FIX_LABEL })).toBeNull();
  });

  // Deterministisk /finalize-design kör helt utan chat-stream: `isGenerating`
  // är falsk hela tiden, så grinden måste komma från den delade signalen.
  it("döljer reparationen under en deterministisk /finalize-design", () => {
    const release = beginF3Finalize();
    try {
      renderEmptyState({ isGenerating: false });
      expect(screen.queryByRole("button", { name: FIX_LABEL })).toBeNull();
    } finally {
      act(() => release());
    }
  });
});

// Template-spåret: mallen bestämmer redan byggvalen, så onboarding-vyn får
// inte blinka förbi medan chatten initieras (prod-observation 2026-08-01).
describe("PreviewPanelEmptyState — template-entry", () => {
  it("visar onboarding-reglagen vid tom start utan templateId", () => {
    renderEmptyState({ chatId: null, versionId: null });
    expect(screen.getByText(WELCOME_TITLE)).toBeTruthy();
  });

  it("säger vad nästa steg är när startsidans beskrivning redan är ifylld", () => {
    renderEmptyState({ chatId: null, versionId: null, hasPrefilledPrompt: true });
    expect(screen.getByText("Din beskrivning är klar")).toBeTruthy();
    expect(screen.getByText(/tryck sedan på pilen i chatten/)).toBeTruthy();
  });

  it("visar laddläge i stället för onboarding när templateId finns i URL:en trots !chatId", () => {
    searchParamsMock.current = new URLSearchParams("project=proj_1&templateId=tmpl_1");
    renderEmptyState({ chatId: null, versionId: null });
    expect(screen.queryByText(WELCOME_TITLE)).toBeNull();
    expect(screen.getByText("Läser in templaten")).toBeTruthy();
    // No chat exists yet — the repair action must not be offered.
    expect(screen.queryByRole("button", { name: FIX_LABEL })).toBeNull();
  });

  it("ignorerar templateId när chatten redan hydrerats", () => {
    searchParamsMock.current = new URLSearchParams("project=proj_1&templateId=tmpl_1");
    renderEmptyState({ chatId: "chat_1", versionId: "ver_1" });
    expect(screen.queryByText("Läser in templaten")).toBeNull();
  });

  it("visar felläge och Försök igen när template-init misslyckats", () => {
    const onRetryTemplateInit = vi.fn();
    searchParamsMock.current = new URLSearchParams("project=proj_1&templateId=tmpl_1");
    renderEmptyState({
      chatId: null,
      versionId: null,
      templateInitError: "Nätverket svarade inte.",
      onRetryTemplateInit,
    });
    expect(screen.queryByText("Läser in templaten")).toBeNull();
    expect(screen.queryByText(WELCOME_TITLE)).toBeNull();
    expect(screen.getByText("Kunde inte läsa in templaten")).toBeTruthy();
    expect(screen.getByText("Nätverket svarade inte.")).toBeTruthy();
    const retry = screen.getByRole("button", { name: "Försök igen" });
    retry.click();
    expect(onRetryTemplateInit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: FIX_LABEL })).toBeNull();
  });
});

// V-01 (riggens baslinje 2026-11-11): "Genererar kod" visades med
// utropstecknet, som läses som ett fel under hela kodgenereringen.
describe("PreviewPanelEmptyState — ikon i arbetslägen", () => {
  function stateIcon(container: HTMLElement): SVGElement {
    const icon = container.querySelector<SVGElement>("svg[data-empty-icon]");
    expect(icon).not.toBeNull();
    return icon!;
  }

  it("visar en spinner, inte ett utropstecken, medan koden genereras", () => {
    const { container } = renderEmptyState({ versionId: null, externalLoading: true });
    expect(screen.getByText("Genererar kod")).toBeTruthy();
    const icon = stateIcon(container);
    expect(icon.dataset.emptyIcon).toBe("working");
    expect(icon.getAttribute("class")).toContain("animate-spin");
  });

  it.each([
    ["verifying", "Verifierar version"],
    ["validating", "Validerar kod"],
    ["repairing", "Reparerar version"],
  ] as const)("visar spinner för versionsstatus %s", (status, title) => {
    const { container } = renderEmptyState({ activeVersionStatus: status });
    expect(screen.getByText(title)).toBeTruthy();
    expect(stateIcon(container).dataset.emptyIcon).toBe("working");
  });

  it("visar spinner när previewn återansluter", () => {
    const { container } = renderEmptyState({ previewLifecycle: "recovering" });
    expect(stateIcon(container).dataset.emptyIcon).toBe("working");
  });

  it("behåller utropstecknet när förhandsvisningen faktiskt saknas", () => {
    const { container } = renderEmptyState();
    expect(screen.getByText("Ingen förhandsvisning ännu")).toBeTruthy();
    const icon = stateIcon(container);
    expect(icon.dataset.emptyIcon).toBe("missing");
    expect(icon.getAttribute("class")).not.toContain("animate-spin");
  });

  it("låter en väntande fråga gå före genereringen", () => {
    const { container } = renderEmptyState({ externalLoading: true, awaitingInput: true });
    expect(stateIcon(container).dataset.emptyIcon).toBe("question");
  });
});

// Komposern publicerar utkast + start via bryggan. Utan publicering ska
// välkomstläget se ut som förut: neutralt förslag och "pilen i chatten".
describe("PreviewPanelEmptyState — välkomst med chattens utkast", () => {
  const START_LABEL = /Skapa första utkastet/;
  const CAFE = "En hemsida för ett mysigt kafé i Uppsala";

  it("visar ingen startknapp när komposern inte publicerat något", () => {
    renderEmptyState({ chatId: null, versionId: null });
    expect(screen.queryByRole("button", { name: START_LABEL })).toBeNull();
    expect(screen.getByText(/för att starta/)).toBeTruthy();
    expect(screen.queryByText(/Förslag utifrån din beskrivning/)).toBeNull();
  });

  it("föreslår utseende ur utkastet utan att erbjuda en död startknapp", () => {
    act(() => publishWelcomeComposer({ draft: CAFE, start: null }));
    renderEmptyState({ chatId: null, versionId: null, onDesignThemeChange: vi.fn() });
    expect(screen.getByText(/Förslag utifrån din beskrivning \(mat och fika\)/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: START_LABEL })).toBeNull();
  });

  it("startar första bygget från panelen när komposern kan skicka", () => {
    const start = vi.fn();
    act(() => publishWelcomeComposer({ draft: CAFE, start }));
    renderEmptyState({ chatId: null, versionId: null, hasPrefilledPrompt: true });
    expect(screen.getByText(/skapa sedan första utkastet/)).toBeTruthy();
    expect(screen.queryByText(/tryck sedan på pilen/)).toBeNull();
    screen.getByRole("button", { name: START_LABEL }).click();
    expect(start).toHaveBeenCalledTimes(1);
  });

  it("döljer startknappen när utkastet är tomt", () => {
    act(() => publishWelcomeComposer({ draft: "   ", start: vi.fn() }));
    renderEmptyState({ chatId: null, versionId: null });
    expect(screen.queryByRole("button", { name: START_LABEL })).toBeNull();
  });

  it("följer komposern när den slutar kunna skicka", () => {
    const start = vi.fn();
    act(() => publishWelcomeComposer({ draft: CAFE, start }));
    renderEmptyState({ chatId: null, versionId: null });
    expect(screen.getByRole("button", { name: START_LABEL })).toBeTruthy();
    act(() => publishWelcomeComposer({ draft: CAFE, start: null }));
    expect(screen.queryByRole("button", { name: START_LABEL })).toBeNull();
  });
});
