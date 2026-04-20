import { describe, expect, it } from "vitest";
import { computeDomainVeto, filterBlockedCategories } from "./domain-veto";

describe("computeDomainVeto", () => {
  it("returns no detected domain for generic prompts", () => {
    const result = computeDomainVeto({
      prompt: "build me a saas dashboard with charts",
    });
    expect(result.detectedDomain).toBeNull();
    expect(result.blockedCategories.size).toBe(0);
  });

  it("detects hospitality and blocks payments/auth/database/etc.", () => {
    const result = computeDomainVeto({
      prompt:
        "Hejsan, jag skulle vilja ha en hemsida som handlar om ett hotell. Jackes Skjuthotell.",
    });
    expect(result.detectedDomain).toBe("hospitality");
    expect(result.blockedCategories.has("payments")).toBe(true);
    expect(result.blockedCategories.has("auth")).toBe(true);
    expect(result.blockedCategories.has("database")).toBe(true);
    expect(result.blockedCategories.has("cms")).toBe(true);
    expect(result.blockedCategories.has("ai")).toBe(true);
  });

  it("detects restaurant and blocks heavy categories", () => {
    const result = computeDomainVeto({
      prompt: "En sajt för en pizzeria med meny och öppettider",
    });
    expect(result.detectedDomain).toBe("restaurant");
    expect(result.blockedCategories.has("payments")).toBe(true);
  });

  it("detects portfolio and blocks heavy categories", () => {
    const result = computeDomainVeto({
      prompt: "En portfolio-sajt för en fotograf",
    });
    expect(result.detectedDomain).toBe("portfolio");
    expect(result.blockedCategories.has("payments")).toBe(true);
    expect(result.blockedCategories.has("auth")).toBe(true);
  });

  it("unblocks payments when user explicitly mentions Stripe", () => {
    const result = computeDomainVeto({
      prompt:
        "En sajt för ett hotell där man kan betala bokningen direkt med Stripe-checkout",
    });
    expect(result.detectedDomain).toBe("hospitality");
    expect(result.blockedCategories.has("payments")).toBe(false);
    expect(result.unblockedByExplicitOverride.has("payments")).toBe(true);
  });

  it("unblocks auth when user explicitly mentions login/inloggning", () => {
    const result = computeDomainVeto({
      prompt: "En portfolio-sajt med inloggning för admin",
    });
    expect(result.detectedDomain).toBe("portfolio");
    expect(result.blockedCategories.has("auth")).toBe(false);
    expect(result.unblockedByExplicitOverride.has("auth")).toBe(true);
  });

  it("uses brief fields when prompt is generic", () => {
    const result = computeDomainVeto({
      prompt: "build a small site",
      brief: {
        oneSentencePitch: "A booking site for a cozy hotel in Småland",
      },
    });
    expect(result.detectedDomain).toBe("hospitality");
  });
});

describe("filterBlockedCategories", () => {
  it("drops items whose category is blocked", () => {
    const veto = computeDomainVeto({
      prompt: "En sajt för Jackes Skjuthotell",
    });
    const items = [
      { entry: { category: "ui-marketing", id: "a" } },
      { entry: { category: "payments", id: "b" } },
      { entry: { category: "ui-content", id: "c" } },
      { entry: { category: "auth", id: "d" } },
    ];
    const out = filterBlockedCategories(items, veto);
    expect(out.map((i) => i.entry.id)).toEqual(["a", "c"]);
  });

  it("returns all items when no domain detected", () => {
    const veto = computeDomainVeto({ prompt: "build a saas" });
    const items = [
      { entry: { category: "payments", id: "a" } },
      { entry: { category: "auth", id: "b" } },
    ];
    const out = filterBlockedCategories(items, veto);
    expect(out).toHaveLength(2);
  });
});
