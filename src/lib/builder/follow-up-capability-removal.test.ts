import { describe, expect, it } from "vitest";

import { detectCapabilityRemoval } from "./follow-up-capability-removal";

/**
 * BUGG B (follow-up removal finns inte) — reproduktion.
 *
 * Prod-fall (chat e298da50): "Ta bort Stripe-betalningsgrejjen" gav en ny
 * version med exakt samma filer — Stripe-filerna låg kvar.
 *
 * Rotorsak (verifierad i kod): `collectExplicitRouteRemovals` kräver
 * route-/sidkontext, så en integrations-borttagning utan sidnamn ger tom Set.
 * Det finns ingen capability-shrink — floret (`enforceFollowUpCapabilityFloor`)
 * är can-only-grow och åter-injicerar `payments`, varpå stripe-checkout väljs
 * igen och filerna bevaras.
 *
 * `detectCapabilityRemoval` är den nya signalen: den paras removal-verb med
 * integrationstermer och returnerar de capability-ids som ska shrinkas.
 */
describe("detectCapabilityRemoval — payments removal (prod repro)", () => {
  it("detects payments removal for the exact prod prompt", () => {
    const result = detectCapabilityRemoval("Ta bort Stripe-betalningsgrejjen");
    expect(result.removedCapabilities).toContain("payments");
  });

  it("detects payments removal for 'Ta bort betalningen'", () => {
    expect(detectCapabilityRemoval("Ta bort betalningen").removedCapabilities).toEqual([
      "payments",
    ]);
  });

  it("detects payments removal for the English 'Remove the Stripe checkout'", () => {
    expect(
      detectCapabilityRemoval("Remove the Stripe checkout").removedCapabilities,
    ).toContain("payments");
  });

  it("detects payments removal for 'Radera Klarna-integrationen'", () => {
    expect(
      detectCapabilityRemoval("Radera Klarna-integrationen").removedCapabilities,
    ).toContain("payments");
  });
});

describe("detectCapabilityRemoval — other integration capabilities", () => {
  it("detects auth removal", () => {
    expect(detectCapabilityRemoval("Ta bort inloggningen").removedCapabilities).toContain(
      "auth",
    );
  });

  it("detects analytics removal", () => {
    expect(
      detectCapabilityRemoval("Plocka bort Google Analytics").removedCapabilities,
    ).toContain("analytics");
  });
});

describe("detectCapabilityRemoval — must NOT over-trigger", () => {
  it("returns nothing for an add prompt", () => {
    expect(detectCapabilityRemoval("Lägg till Stripe-betalning").removedCapabilities).toEqual(
      [],
    );
  });

  it("returns nothing for a pure visual edit", () => {
    expect(detectCapabilityRemoval("Ändra bakgrundsfärgen till blå").removedCapabilities).toEqual(
      [],
    );
  });

  it("does not treat a content-on-page removal as a capability removal", () => {
    // "Ta bort knappen på startsidan" removes an element, not the integration.
    expect(
      detectCapabilityRemoval("Ta bort knappen på startsidan").removedCapabilities,
    ).toEqual([]);
  });

  it("returns nothing for an empty prompt", () => {
    expect(detectCapabilityRemoval("").removedCapabilities).toEqual([]);
  });
});
