import { describe, expect, it, vi } from "vitest";
import { parseSSEBuffer } from "@/lib/gen/stream/sse-parser";
import { emitOwnEngineToolCallSse } from "./generation-stream-tools";

describe("emitOwnEngineToolCallSse", () => {
  it("emits integration SSE for suggestIntegration in F3 without blocking", () => {
    const chunks: Uint8Array[] = [];
    const enc = new TextEncoder();
    let blocking = false;
    emitOwnEngineToolCallSse(
      {
        enc,
        safeEnqueue: (d) => chunks.push(d),
        toolCallNames: new Set(),
        toolSignaledProviders: new Set(),
        setBlockingToolCall: () => {
          blocking = true;
        },
        lifecycleStage: "integrations",
      },
      {
        toolName: "suggestIntegration",
        args: {
          provider: "stripe",
          name: "Stripe",
          envVars: ["STRIPE_SECRET_KEY"],
        },
      },
    );
    expect(blocking).toBe(false);
    const text = chunks.map((c) => new TextDecoder().decode(c)).join("");
    const { events } = parseSSEBuffer(text);
    const integration = events.find((e) => e.event === "integration");
    expect(integration).toBeDefined();
    const data = integration?.data as { items: Array<{ key: string }> };
    expect(data.items[0]?.key).toBe("stripe");
  });

  it("does not mark blocking for emitPlanArtifact", () => {
    const enc = new TextEncoder();
    let blocking = false;
    emitOwnEngineToolCallSse(
      {
        enc,
        safeEnqueue: vi.fn(),
        toolCallNames: new Set(),
        toolSignaledProviders: new Set(),
        setBlockingToolCall: () => {
          blocking = true;
        },
      },
      { toolName: "emitPlanArtifact", toolCallId: "p1", args: { plan: "x" } },
    );
    expect(blocking).toBe(false);
  });

  it("drops suggestIntegration SSE in F2 (lifecycleStage='design')", () => {
    const chunks: Uint8Array[] = [];
    const enc = new TextEncoder();
    const providers = new Set<string>();
    emitOwnEngineToolCallSse(
      {
        enc,
        safeEnqueue: (d) => chunks.push(d),
        toolCallNames: new Set(),
        toolSignaledProviders: providers,
        setBlockingToolCall: () => {},
        lifecycleStage: "design",
      },
      {
        toolName: "suggestIntegration",
        args: { provider: "stripe", name: "Stripe", envVars: ["STRIPE_SECRET_KEY"] },
      },
    );
    expect(chunks.length).toBe(0);
    expect(providers.size).toBe(0);
  });

  it("drops requestEnvVar SSE in F2 (lifecycleStage='design')", () => {
    const chunks: Uint8Array[] = [];
    const enc = new TextEncoder();
    emitOwnEngineToolCallSse(
      {
        enc,
        safeEnqueue: (d) => chunks.push(d),
        toolCallNames: new Set(),
        toolSignaledProviders: new Set(),
        setBlockingToolCall: () => {},
        lifecycleStage: "design",
      },
      {
        toolName: "requestEnvVar",
        args: { key: "MY_KEY", description: "Needed for thing" },
      },
    );
    expect(chunks.length).toBe(0);
  });

  it("emits requestEnvVar SSE in F3 (lifecycleStage='integrations')", () => {
    const chunks: Uint8Array[] = [];
    const enc = new TextEncoder();
    emitOwnEngineToolCallSse(
      {
        enc,
        safeEnqueue: (d) => chunks.push(d),
        toolCallNames: new Set(),
        toolSignaledProviders: new Set(),
        setBlockingToolCall: () => {},
        lifecycleStage: "integrations",
      },
      {
        toolName: "requestEnvVar",
        args: { key: "MY_KEY", description: "Needed for thing" },
      },
    );
    expect(chunks.length).toBeGreaterThan(0);
    const text = chunks.map((c) => new TextDecoder().decode(c)).join("");
    const { events } = parseSSEBuffer(text);
    expect(events.find((e) => e.event === "integration")).toBeDefined();
  });
});
