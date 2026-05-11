import { afterEach, describe, expect, it, vi } from "vitest";

async function loadDefaultThinkingModule(env: {
  defaultThinking?: string;
}) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({
    getServerEnv: () => ({
      SAJTMASKIN_DEFAULT_THINKING: env.defaultThinking,
    }),
  }));
  return import("./default-thinking");
}

afterEach(() => {
  vi.doUnmock("@/lib/env");
  vi.resetModules();
});

describe("getDefaultThinkingEnabled", () => {
  it("returns true when SAJTMASKIN_DEFAULT_THINKING is affirmative", async () => {
    const { getDefaultThinkingEnabled } = await loadDefaultThinkingModule({
      defaultThinking: "true",
    });

    expect(getDefaultThinkingEnabled()).toBe(true);
  });

  it("returns false when SAJTMASKIN_DEFAULT_THINKING is unset", async () => {
    const { getDefaultThinkingEnabled } = await loadDefaultThinkingModule({});

    expect(getDefaultThinkingEnabled()).toBe(false);
  });

  it("returns false when SAJTMASKIN_DEFAULT_THINKING is explicitly false", async () => {
    const { getDefaultThinkingEnabled } = await loadDefaultThinkingModule({
      defaultThinking: "false",
    });

    expect(getDefaultThinkingEnabled()).toBe(false);
  });
});

describe("toAnthropicEffort", () => {
  it("maps shared reasoning effort levels to supported Anthropic effort levels", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/env");
    const { toAnthropicEffort } = await import("./engine");

    expect(toAnthropicEffort("none")).toBe("low");
    expect(toAnthropicEffort("low")).toBe("low");
    expect(toAnthropicEffort("medium")).toBe("medium");
    expect(toAnthropicEffort("high")).toBe("high");
    expect(toAnthropicEffort("xhigh")).toBe("max");
  }, 15_000);
});
