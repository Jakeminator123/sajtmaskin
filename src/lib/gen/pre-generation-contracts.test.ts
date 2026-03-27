import { describe, expect, it } from "vitest";
import { inferPreGenerationContracts } from "./pre-generation-contracts";
import type { InferredCapabilities } from "./capability-inference";

const baseCaps = (over: Partial<InferredCapabilities> = {}): InferredCapabilities => ({
  needsMotion: false,
  needs3D: false,
  needsCharts: false,
  needsDatabase: false,
  needsAuth: false,
  needsAppShell: false,
  needsDataUI: false,
  needsForms: false,
  needsEcommerce: false,
  needsCarousel: false,
  needsPremiumVisuals: false,
  ...over,
});

describe("inferPreGenerationContracts — UI answers", () => {
  it('clears database unresolved when user picks "Annat / vet inte än" (mock first)', () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Vi behöver spara data i en databas",
      buildIntent: "website",
      capabilities: baseCaps({ needsDatabase: true }),
      contractAnswers: [
        {
          kind: "database",
          question: "Vilken datalagring ska vi bygga mot nu?",
          answer: "Annat / vet inte än",
        },
      ],
    });

    expect(ctx.unresolvedDecisions.some((d) => d.kind === "database")).toBe(false);
    expect(ctx.contracts.databaseProvider).toBe("mock data");
    expect(ctx.contracts.dataMode).toBe("mocked");
  });

  it('clears auth unresolved when user picks "Annat / vet inte än" (no auth yet)', () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Bygg inloggning och användarkonto",
      buildIntent: "website",
      capabilities: baseCaps({ needsAuth: true }),
      contractAnswers: [
        {
          kind: "auth",
          question: "Vilken autentisering?",
          answer: "Annat / vet inte än",
        },
      ],
    });

    expect(ctx.unresolvedDecisions.some((d) => d.kind === "auth")).toBe(false);
    expect(ctx.contracts.authProvider).toBe("ingen");
  });

  it('clears payment unresolved when user picks "Annat / vet inte än"', () => {
    const ctx = inferPreGenerationContracts({
      prompt: "Checkout och betalning med kort",
      buildIntent: "website",
      capabilities: baseCaps({ needsEcommerce: true }),
      contractAnswers: [
        {
          kind: "payment",
          question: "Vilken betal-lösning?",
          answer: "Annat / vet inte än",
        },
      ],
    });

    expect(ctx.unresolvedDecisions.some((d) => d.kind === "payment")).toBe(false);
    expect(ctx.contracts.paymentProvider).toBe("ingen");
  });
});
