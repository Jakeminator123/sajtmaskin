import { describe, expect, it, vi } from "vitest";
import { parseSSEBuffer } from "@/lib/gen/route-helpers";
import { emitOwnEngineToolCallSse } from "./generation-stream-tools";

describe("emitOwnEngineToolCallSse", () => {
  it("emits integration SSE for suggestIntegration and marks blocking", () => {
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
    expect(blocking).toBe(true);
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
});
