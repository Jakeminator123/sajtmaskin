import { describe, expect, it, vi } from "vitest";
import { parseSSEBuffer } from "@/lib/gen/stream/sse-parser";
import { emitOwnEngineToolCallSse } from "./generation-stream-tools";

describe("emitOwnEngineToolCallSse", () => {
  it("emits integration SSE for suggestIntegration in F3 without blocking", () => {
    const chunks: Uint8Array[] = [];
    const enc = new TextEncoder();
    const toolCallNames = new Set<string>();
    let blocking = false;
    emitOwnEngineToolCallSse(
      {
        enc,
        safeEnqueue: (d) => chunks.push(d),
        toolCallNames,
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
    expect(toolCallNames.has("suggestIntegration")).toBe(true);
  });

  it("derives integration name from provider when suggestIntegration omits name", () => {
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
        toolName: "suggestIntegration",
        args: {
          provider: "stripe",
          envVars: ["STRIPE_SECRET_KEY"],
        },
      },
    );
    const text = chunks.map((c) => new TextDecoder().decode(c)).join("");
    const { events } = parseSSEBuffer(text);
    const integration = events.find((e) => e.event === "integration");
    expect(integration).toBeDefined();
    const data = integration?.data as {
      items: Array<{ key?: string; provider?: string; name?: string }>;
    };
    expect(data.items[0]?.key).toBe("stripe");
    expect(data.items[0]?.provider).toBe("stripe");
    expect(data.items[0]?.name).toBe("Stripe");
  });

  it("drops malformed suggestIntegration calls with generic empty payload", () => {
    const chunks: Uint8Array[] = [];
    const providers = new Set<string>();
    const toolCallNames = new Set<string>();
    const enc = new TextEncoder();
    emitOwnEngineToolCallSse(
      {
        enc,
        safeEnqueue: (d) => chunks.push(d),
        toolCallNames,
        toolSignaledProviders: providers,
        setBlockingToolCall: () => {},
        lifecycleStage: "integrations",
      },
      {
        toolName: "suggestIntegration",
        args: {
          name: "Integration",
        },
      },
    );
    expect(chunks).toHaveLength(0);
    expect(providers.size).toBe(0);
    // Codex P2 (PR #375): droppade signaler får inte registreras som tool-call
    // — annars triggas "tool_only_empty_generation"-spökprompten i chatten.
    expect(toolCallNames.size).toBe(0);
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
    const toolCallNames = new Set<string>();
    emitOwnEngineToolCallSse(
      {
        enc,
        safeEnqueue: (d) => chunks.push(d),
        toolCallNames,
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
    // Giltig men F2-mutad signal registreras ändå som tool-call så att en
    // tool-only-generation ger "kör igen eller fortsätt"-prompten
    // (tool_only_empty_generation) — pinnas även av stream/route.test.ts.
    expect(toolCallNames.has("suggestIntegration")).toBe(true);
  });

  it("does not suppress the post-finalize detector when envVars are empty (Codex P2)", () => {
    const chunks: Uint8Array[] = [];
    const providers = new Set<string>();
    const toolCallNames = new Set<string>();
    emitOwnEngineToolCallSse(
      {
        enc: new TextEncoder(),
        safeEnqueue: (d) => chunks.push(d),
        toolCallNames,
        toolSignaledProviders: providers,
        setBlockingToolCall: () => {},
        lifecycleStage: "integrations",
      },
      {
        toolName: "suggestIntegration",
        args: { name: "OpenAI", envVars: [] },
      },
    );
    // Signalen emitteras (giltigt namn) men providern markeras INTE som
    // signalerad — detektorn ska kunna återvinna riktiga env-nycklar ur koden.
    expect(chunks.length).toBeGreaterThan(0);
    expect(toolCallNames.has("suggestIntegration")).toBe(true);
    expect(providers.size).toBe(0);
  });

  it("does not register malformed suggestIntegration in F2 either (VADE)", () => {
    const toolCallNames = new Set<string>();
    emitOwnEngineToolCallSse(
      {
        enc: new TextEncoder(),
        safeEnqueue: vi.fn(),
        toolCallNames,
        toolSignaledProviders: new Set(),
        setBlockingToolCall: () => {},
        lifecycleStage: "design",
      },
      {
        toolName: "suggestIntegration",
        args: { name: "Integration" },
      },
    );
    expect(toolCallNames.size).toBe(0);
  });

  // C1 (empty-output tool feedback fix): the malformed-call counter must
  // fire in BOTH lanes so `handleEmptyGeneration` can tell "model tried to
  // signal something but it was garbage" apart from a truly silent round —
  // regardless of whether the drop happens via the F2 early defense-in-depth
  // branch or the deeper F3 validation branch.
  it("fires registerMalformedIntegrationToolCall for a malformed suggestIntegration in F2", () => {
    const toolCallNames = new Set<string>();
    let malformedCount = 0;
    emitOwnEngineToolCallSse(
      {
        enc: new TextEncoder(),
        safeEnqueue: vi.fn(),
        toolCallNames,
        toolSignaledProviders: new Set(),
        setBlockingToolCall: () => {},
        registerMalformedIntegrationToolCall: () => {
          malformedCount += 1;
        },
        lifecycleStage: "design",
      },
      {
        toolName: "suggestIntegration",
        args: { name: "integration" },
      },
    );
    expect(toolCallNames.size).toBe(0);
    expect(malformedCount).toBe(1);
  });

  it("fires registerMalformedIntegrationToolCall for a malformed suggestIntegration in F3", () => {
    const toolCallNames = new Set<string>();
    let malformedCount = 0;
    emitOwnEngineToolCallSse(
      {
        enc: new TextEncoder(),
        safeEnqueue: vi.fn(),
        toolCallNames,
        toolSignaledProviders: new Set(),
        setBlockingToolCall: () => {},
        registerMalformedIntegrationToolCall: () => {
          malformedCount += 1;
        },
        lifecycleStage: "integrations",
      },
      {
        toolName: "suggestIntegration",
        args: { name: "integration" },
      },
    );
    expect(toolCallNames.size).toBe(0);
    expect(malformedCount).toBe(1);
  });

  it("does not fire registerMalformedIntegrationToolCall for a well-formed suggestIntegration", () => {
    let malformedCount = 0;
    emitOwnEngineToolCallSse(
      {
        enc: new TextEncoder(),
        safeEnqueue: vi.fn(),
        toolCallNames: new Set(),
        toolSignaledProviders: new Set(),
        setBlockingToolCall: () => {},
        registerMalformedIntegrationToolCall: () => {
          malformedCount += 1;
        },
        lifecycleStage: "integrations",
      },
      {
        toolName: "suggestIntegration",
        args: { provider: "stripe", name: "Stripe", envVars: ["STRIPE_SECRET_KEY"] },
      },
    );
    expect(malformedCount).toBe(0);
  });

  it("fires registerMalformedIntegrationToolCall for a malformed requestEnvVar (missing key) in F3", () => {
    let malformedCount = 0;
    const chunks: Uint8Array[] = [];
    emitOwnEngineToolCallSse(
      {
        enc: new TextEncoder(),
        safeEnqueue: (d) => chunks.push(d),
        toolCallNames: new Set(),
        toolSignaledProviders: new Set(),
        setBlockingToolCall: () => {},
        registerMalformedIntegrationToolCall: () => {
          malformedCount += 1;
        },
        lifecycleStage: "integrations",
      },
      {
        toolName: "requestEnvVar",
        args: { description: "Needed for thing" },
      },
    );
    expect(chunks).toHaveLength(0);
    expect(malformedCount).toBe(1);
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
