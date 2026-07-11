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

describe("detectCapabilityRemoval — subscriptions vs payments split (#475 follow-up)", () => {
  it("detects subscriptions removal (not payments) for 'Ta bort prenumerationsbetalningen'", () => {
    const result = detectCapabilityRemoval("Ta bort prenumerationsbetalningen");
    expect(result.removedCapabilities).toContain("subscriptions");
    expect(result.removedCapabilities).not.toContain("payments");
  });

  it("detects subscriptions removal for 'Ta bort prenumerationen'", () => {
    const result = detectCapabilityRemoval("Ta bort prenumerationen");
    expect(result.removedCapabilities).toEqual(["subscriptions"]);
  });

  it("detects subscriptions removal for 'Ta bort Paddle-abonnemanget'", () => {
    expect(
      detectCapabilityRemoval("Ta bort Paddle").removedCapabilities,
    ).toContain("subscriptions");
  });

  it("detects subscriptions removal for 'Remove the membership billing'", () => {
    expect(
      detectCapabilityRemoval("Remove the membership billing").removedCapabilities,
    ).toContain("subscriptions");
  });

  it("still detects payments (not subscriptions) for a one-off checkout removal", () => {
    const result = detectCapabilityRemoval("Ta bort Stripe-betalningen");
    expect(result.removedCapabilities).toContain("payments");
    expect(result.removedCapabilities).not.toContain("subscriptions");
  });

  it("keeps a plain 'Ta bort betalningen' as payments only", () => {
    expect(detectCapabilityRemoval("Ta bort betalningen").removedCapabilities).toEqual([
      "payments",
    ]);
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

describe("detectCapabilityRemoval — subscriptions/payments split (Vercel Agent #475)", () => {
  // The dossier-batch PR promoted `subscriptions` (Paddle, recurring) as a
  // capability distinct from one-off `payments` (Stripe) and updated the
  // DETECTION vocabulary — but the REMOVAL vocabulary was left unchanged, so a
  // recurring-billing removal was mis-attributed to payments and Paddle could
  // never be removed at all. These lock the mirrored split.
  it("attributes recurring-billing removal to subscriptions, not payments", () => {
    expect(
      detectCapabilityRemoval("ta bort prenumerationsbetalning").removedCapabilities,
    ).toEqual(["subscriptions"]);
    expect(
      detectCapabilityRemoval("remove subscription billing").removedCapabilities,
    ).toEqual(["subscriptions"]);
  });

  it("can remove the Paddle subscriptions capability via a follow-up", () => {
    expect(detectCapabilityRemoval("ta bort prenumerationen").removedCapabilities).toEqual([
      "subscriptions",
    ]);
    expect(detectCapabilityRemoval("remove subscriptions").removedCapabilities).toEqual([
      "subscriptions",
    ]);
    expect(detectCapabilityRemoval("ta bort Paddle").removedCapabilities).toEqual([
      "subscriptions",
    ]);
    expect(detectCapabilityRemoval("ta bort medlemskapet").removedCapabilities).toEqual([
      "subscriptions",
    ]);
  });

  it("keeps one-off Stripe payments removal on the payments capability", () => {
    expect(
      detectCapabilityRemoval("Ta bort Stripe-betalningsgrejjen").removedCapabilities,
    ).toEqual(["payments"]);
    expect(
      detectCapabilityRemoval("Remove the Stripe checkout").removedCapabilities,
    ).toEqual(["payments"]);
  });

  it("vetoes newsletter / one-off phrases from firing the Paddle capability", () => {
    // Newsletter "prenumeration" must not shrink Paddle subscriptions.
    expect(
      detectCapabilityRemoval("ta bort nyhetsbrevsprenumerationen").removedCapabilities,
    ).not.toContain("subscriptions");
    // One-off payment removal must not fire subscriptions.
    expect(
      detectCapabilityRemoval("ta bort engångsbetalningen").removedCapabilities,
    ).not.toContain("subscriptions");
  });

  it("scopes subscription vetoes to the matched clause", () => {
    expect(
      detectCapabilityRemoval(
        "ta bort prenumerationerna men behåll nyhetsbrevet",
      ).removedCapabilities,
    ).toContain("subscriptions");
    expect(
      detectCapabilityRemoval(
        "remove one-time payments and subscriptions",
      ).removedCapabilities,
    ).toContain("subscriptions");
  });

  it("matches plural memberships", () => {
    expect(
      detectCapabilityRemoval("remove memberships").removedCapabilities,
    ).toContain("subscriptions");
  });

  it("still removes the newsletter capability on an explicit newsletter removal", () => {
    expect(detectCapabilityRemoval("ta bort nyhetsbrevet").removedCapabilities).toEqual([
      "newsletter-subscribe",
    ]);
  });

  it("removes both when the prompt names Stripe AND the subscription", () => {
    expect(
      detectCapabilityRemoval("ta bort Stripe och prenumerationen").removedCapabilities,
    ).toEqual(["payments", "subscriptions"]);
  });

  it("does not fire subscriptions on an additive prompt", () => {
    expect(
      detectCapabilityRemoval("Lägg till prenumerationer").removedCapabilities,
    ).toEqual([]);
  });
});

describe("detectCapabilityRemoval — clause scoping (Codex on #447)", () => {
  it("does not shrink a capability when an additive provider precedes a removed sibling", () => {
    expect(
      detectCapabilityRemoval("Lägg till Stripe och ta bort Klarna")
        .removedCapabilities,
    ).not.toContain("payments");
  });

  it("does not report an ADDED integration as removed in a compound add+remove prompt", () => {
    expect(
      detectCapabilityRemoval("Ta bort hero-sektionen och lägg till Stripe-betalning")
        .removedCapabilities,
    ).toEqual([]);
  });

  it("keeps payments on a provider swap ('Ta bort Stripe och använd Klarna i stället')", () => {
    expect(
      detectCapabilityRemoval("Ta bort Stripe och använd Klarna i stället")
        .removedCapabilities,
    ).toEqual([]);
  });

  it("does not treat a checkout BUTTON removal as a payments-capability removal", () => {
    expect(
      detectCapabilityRemoval("Ta bort checkout-knappen från pris-sektionen")
        .removedCapabilities,
    ).toEqual([]);
  });

  it("does not treat 'drop-down' as a removal verb", () => {
    expect(
      detectCapabilityRemoval("Add a drop-down checkout selector").removedCapabilities,
    ).toEqual([]);
  });

  it("still detects removal when the removal clause comes last", () => {
    expect(
      detectCapabilityRemoval("Gör hero-rubriken större och ta bort Stripe-betalningen")
        .removedCapabilities,
    ).toEqual(["payments"]);
  });
});
