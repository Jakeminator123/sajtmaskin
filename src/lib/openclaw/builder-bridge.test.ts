import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBuilderBridge,
  registerBuilderBridge,
  resetBuilderBridgeForTests,
  waitForBuilderSend,
  type BuilderBridge,
} from "./builder-bridge";

function makeBridge(overrides: Partial<BuilderBridge> = {}): BuilderBridge {
  return {
    getChatId: () => "chat_1",
    canSend: () => true,
    sendMessage: vi.fn(async () => ({ status: "started", via: "stream" }) as const),
    cancelGeneration: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  resetBuilderBridgeForTests();
});

describe("builder-bridge", () => {
  it("registrerar och avregistrerar exakt den egna bryggan", () => {
    const first = makeBridge();
    const unregisterFirst = registerBuilderBridge(first);
    expect(getBuilderBridge()).toBe(first);

    const second = makeBridge();
    registerBuilderBridge(second);
    expect(getBuilderBridge()).toBe(second);

    // Den första effektens cleanup får inte ta bort den andra bryggan.
    unregisterFirst();
    expect(getBuilderBridge()).toBe(second);
  });

  it("svarar no_bridge utan registrering", async () => {
    await expect(waitForBuilderSend({ maxAttempts: 2, intervalMs: 1 })).resolves.toEqual({
      ok: false,
      reason: "no_bridge",
    });
  });

  it("väntar in att buildern blir ledig", async () => {
    let busyPolls = 2;
    const bridge = makeBridge({
      canSend: () => {
        if (busyPolls > 0) {
          busyPolls -= 1;
          return false;
        }
        return true;
      },
    });
    registerBuilderBridge(bridge);
    const result = await waitForBuilderSend({ maxAttempts: 5, intervalMs: 1 });
    expect(result).toEqual({ ok: true, bridge });
  });

  it("ger upp som busy när buildern aldrig blir ledig", async () => {
    registerBuilderBridge(makeBridge({ canSend: () => false }));
    await expect(waitForBuilderSend({ maxAttempts: 3, intervalMs: 1 })).resolves.toEqual({
      ok: false,
      reason: "busy",
    });
  });

  it("avbryter när anroparen avmonterats", async () => {
    registerBuilderBridge(makeBridge({ canSend: () => false }));
    await expect(
      waitForBuilderSend({ maxAttempts: 3, intervalMs: 1, isCancelled: () => true }),
    ).resolves.toEqual({ ok: false, reason: "cancelled" });
  });
});
