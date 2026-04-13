import { afterEach, describe, expect, it, vi } from "vitest";

async function loadDefaultThinkingModule(env: {
  defaultThinking?: string;
  showThinking?: string;
}) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({
    getServerEnv: () => ({
      SAJTMASKIN_DEFAULT_THINKING: env.defaultThinking,
      SAJTMASKIN_SHOW_THINKING: env.showThinking,
    }),
  }));
  return import("./default-thinking");
}

afterEach(() => {
  vi.resetModules();
});

describe("getDefaultThinkingEnabled", () => {
  it("prefers SAJTMASKIN_DEFAULT_THINKING over the legacy alias", async () => {
    const { getDefaultThinkingEnabled } = await loadDefaultThinkingModule({
      defaultThinking: "true",
      showThinking: "false",
    });

    expect(getDefaultThinkingEnabled()).toBe(true);
  });

  it("falls back to SAJTMASKIN_SHOW_THINKING when the canonical env is unset", async () => {
    const { getDefaultThinkingEnabled } = await loadDefaultThinkingModule({
      showThinking: "1",
    });

    expect(getDefaultThinkingEnabled()).toBe(true);
  });

  it("returns false when neither env enables thinking", async () => {
    const { getDefaultThinkingEnabled } = await loadDefaultThinkingModule({
      defaultThinking: "false",
      showThinking: "true",
    });

    expect(getDefaultThinkingEnabled()).toBe(false);
  });
});

describe("toAnthropicEffort", () => {
  it("maps shared reasoning effort levels to supported Anthropic effort levels", async () => {
    vi.resetModules();
    const { toAnthropicEffort } = await import("./engine");

    expect(toAnthropicEffort("none")).toBe("low");
    expect(toAnthropicEffort("low")).toBe("low");
    expect(toAnthropicEffort("medium")).toBe("medium");
    expect(toAnthropicEffort("high")).toBe("high");
    expect(toAnthropicEffort("xhigh")).toBe("max");
  });
});
