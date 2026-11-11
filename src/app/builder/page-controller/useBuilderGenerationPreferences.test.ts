import { useRef, useState } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  WELCOME_DESIGN_THEME_KEY,
  useBuilderGenerationPreferences,
} from "./useBuilderGenerationPreferences";
import type { DesignTheme } from "@/lib/builder/theme-presets";
import {
  clearFirstBuildFromWelcome,
  noteFirstBuildFromWelcome,
} from "@/lib/builder/welcome-composer-bridge";
import type { ModelTier } from "@/lib/validations/chat-schemas";

const LEGACY_KEY = "sajtmaskin:designTheme";

/** The shell's real state shape, so the hook's setters act on live state. */
function useHarness(chatId: string | null) {
  const [enableThinking, setEnableThinking] = useState(false);
  const [selectedModelTier, setSelectedModelTier] = useState<ModelTier>("gpt-5.4" as ModelTier);
  const [enableImageGenerations, setEnableImageGenerations] = useState(false);
  const [enableBlobMedia, setEnableBlobMedia] = useState(false);
  const [designTheme, setDesignTheme] = useState<DesignTheme>("off");
  const applyingGenerationSettingsRef = useRef(false);
  const loadedGenerationSettingsChatRef = useRef<string | null>(null);
  useBuilderGenerationPreferences({
    chatId,
    enableThinking,
    setEnableThinking,
    selectedModelTier,
    setSelectedModelTier,
    enableImageGenerations,
    setEnableImageGenerations,
    enableBlobMedia,
    setEnableBlobMedia,
    designTheme,
    setDesignTheme,
    applyingGenerationSettingsRef,
    loadedGenerationSettingsChatRef,
  });
  return { designTheme, setDesignTheme };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearFirstBuildFromWelcome();
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearFirstBuildFromWelcome();
});

describe("useBuilderGenerationPreferences — Sidans utseende följer sin sajt", () => {
  /**
   * The old global key was restored on every load, also for an existing
   * project, and `themeColors` then locked that palette onto its follow-ups.
   */
  it("läser inte in en global färg när ett befintligt projekt öppnas", () => {
    localStorage.setItem(LEGACY_KEY, "orange");
    sessionStorage.setItem(WELCOME_DESIGN_THEME_KEY, "orange");
    const { result } = renderHook(() => useHarness("chat_existing"));
    expect(result.current.designTheme).toBe("off");
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("återställer välkomstutkastet i samma flik (t.ex. efter inloggning)", () => {
    sessionStorage.setItem(WELCOME_DESIGN_THEME_KEY, "blue");
    const { result } = renderHook(() => useHarness(null));
    // Havsblå (`blue`) överlever nu; den gamla migreringen gjorde det till Auto.
    expect(result.current.designTheme).toBe("blue");
    expect(sessionStorage.getItem(WELCOME_DESIGN_THEME_KEY)).toBe("blue");
  });

  it("sparar välkomstvalet för fliken men aldrig globalt", () => {
    const { result } = renderHook(() => useHarness(null));
    act(() => result.current.setDesignTheme("green"));
    expect(sessionStorage.getItem(WELCOME_DESIGN_THEME_KEY)).toBe("green");
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it("behåller valet för chatten som skapas här och förbrukar utkastet", () => {
    const { result, rerender } = renderHook(({ chatId }) => useHarness(chatId), {
      initialProps: { chatId: null as string | null },
    });
    act(() => result.current.setDesignTheme("orange"));
    // Välkomstytan såg bygget starta innan någon chatt fanns.
    noteFirstBuildFromWelcome();
    rerender({ chatId: "chat_new" });
    expect(result.current.designTheme).toBe("orange");
    expect(sessionStorage.getItem(WELCOME_DESIGN_THEME_KEY)).toBeNull();
  });

  it("nollställer när man byter till ett annat projekt", () => {
    const { result, rerender } = renderHook(({ chatId }) => useHarness(chatId), {
      initialProps: { chatId: null as string | null },
    });
    act(() => result.current.setDesignTheme("orange"));
    noteFirstBuildFromWelcome();
    rerender({ chatId: "chat_a" });
    expect(result.current.designTheme).toBe("orange");
    rerender({ chatId: "chat_b" });
    expect(result.current.designTheme).toBe("off");
  });
});

/**
 * R-1743 P2: projektlänkarna går till `/builder?project=<id>`. Där är chatten
 * null vid mount och kommer först efter `/api/projects/:id/chat`
 * (`useBuilderEntryHydration`). Ingen skapning startade, så välkomstvalet får
 * inte följa med in i den befintliga sajten.
 */
describe("useBuilderGenerationPreferences — projekt öppnat via ?project=", () => {
  it("släpper ett återställt välkomstutkast när projektets chatt hydreras sent", () => {
    sessionStorage.setItem(WELCOME_DESIGN_THEME_KEY, "orange");
    const { result, rerender } = renderHook(({ chatId }) => useHarness(chatId), {
      initialProps: { chatId: null as string | null },
    });
    expect(result.current.designTheme).toBe("orange");
    rerender({ chatId: "chat_existing" });
    expect(result.current.designTheme).toBe("off");
  });

  it("släpper ett välkomstval som aldrig byggdes när ett projekt öppnas i samma flik", () => {
    const { result, rerender } = renderHook(({ chatId }) => useHarness(chatId), {
      initialProps: { chatId: null as string | null },
    });
    act(() => result.current.setDesignTheme("orange"));
    rerender({ chatId: "chat_existing" });
    expect(result.current.designTheme).toBe("off");
  });

  it("förbrukar markeringen så att den inte följer med till nästa öppning", () => {
    noteFirstBuildFromWelcome();
    const first = renderHook(({ chatId }) => useHarness(chatId), {
      initialProps: { chatId: null as string | null },
    });
    act(() => first.result.current.setDesignTheme("orange"));
    first.rerender({ chatId: "chat_created" });
    expect(first.result.current.designTheme).toBe("orange");
    first.unmount();

    const second = renderHook(({ chatId }) => useHarness(chatId), {
      initialProps: { chatId: null as string | null },
    });
    act(() => second.result.current.setDesignTheme("green"));
    second.rerender({ chatId: "chat_existing" });
    expect(second.result.current.designTheme).toBe("off");
  });
});
