import { describe, expect, it } from "vitest";
import { inferCapabilities } from "./capability-inference";
import {
  applyDeferredContractPlaceholders,
  inferPreGenerationContracts,
} from "./pre-generation-contracts";

describe("applyDeferredContractPlaceholders", () => {
  it("clears unresolved auth when defer placeholders run", () => {
    const prompt = "Build a dashboard with login and user accounts";
    const ctx = inferPreGenerationContracts({
      prompt,
      buildIntent: "website",
      brief: null,
      capabilities: inferCapabilities(prompt),
    });
    expect(ctx.unresolvedDecisions.some((d) => d.kind === "auth")).toBe(true);

    applyDeferredContractPlaceholders(ctx);

    expect(ctx.unresolvedDecisions.some((d) => d.kind === "auth")).toBe(false);
    expect(ctx.contracts.authProvider).toBe("ingen");
  });
});
