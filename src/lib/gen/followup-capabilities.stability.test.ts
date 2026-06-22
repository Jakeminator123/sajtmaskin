import { describe, expect, it } from "vitest";

import {
  enforceFollowUpCapabilityFloor,
  filterDossierCapabilitiesForPrompt,
} from "./orchestrate";

/**
 * Grandmaster Område 5 — 5-5: capabilities can-only-grow.
 *
 * Källa: docs/plans/avklarat/grandmaster/aktiviteter/5-5-capabilities-can-only-grow.md
 *
 * Invariant som låses: en follow-up får ALDRIG tyst tappa en capability som
 * basversionen redan etablerat. `FollowUpContract.capabilities` (snapshotens
 * `requestedCapabilities`) är ett GOLV (floor) som union:as tillbaka EFTER
 * `filterDossierCapabilitiesForPrompt` — så en etablerad bas-capability (t.ex.
 * en init-`contact-form`) aldrig kan filtreras bort bara för att detta
 * follow-up-meddelande inte nämner den. Golv, inte tak: nya capabilities flödar
 * fortfarande igenom; init är en no-op.
 *
 * Till skillnad från scaffold/variant/route är golvet INTE undantaget på
 * clear-redesign — en omdesign får inte tyst tappa en betald integration.
 */

describe("5-5 capabilities can-only-grow — enforceFollowUpCapabilityFloor (unit)", () => {
  it("restores a base capability this follow-up message never mentions", () => {
    const decision = enforceFollowUpCapabilityFloor({
      resolvedMode: "followUp",
      resolvedCapabilities: ["hero"],
      contractCapabilities: ["contact-form", "stripe-checkout"],
    });
    expect(decision.floorApplied).toBe(true);
    expect(decision.capabilities).toEqual(["hero", "contact-form", "stripe-checkout"]);
    expect(decision.restoredCapabilities).toEqual(["contact-form", "stripe-checkout"]);
  });

  it("grows the union when the follow-up adds a new capability (floor ∪ new)", () => {
    const decision = enforceFollowUpCapabilityFloor({
      resolvedMode: "followUp",
      // `newsletter` is newly requested this turn; the floor is already covered.
      resolvedCapabilities: ["contact-form", "newsletter"],
      contractCapabilities: ["contact-form"],
    });
    expect(decision.capabilities).toEqual(["contact-form", "newsletter"]);
    expect(decision.floorApplied).toBe(false);
    expect(decision.restoredCapabilities).toEqual([]);
  });

  it("keeps a contract capability absent from a fresh brief/caller (drop-väg: empty resolved)", () => {
    const decision = enforceFollowUpCapabilityFloor({
      resolvedMode: "followUp",
      resolvedCapabilities: [],
      contractCapabilities: ["contact-form"],
    });
    expect(decision.capabilities).toEqual(["contact-form"]);
    expect(decision.floorApplied).toBe(true);
  });

  it("applies the floor on clear-redesign too (a redesign must not drop a paid integration)", () => {
    // clear-redesign is still resolvedMode:"followUp"; the floor is NOT exempt
    // here (unlike scaffold/variant/route). can-only-grow holds across redesign.
    const decision = enforceFollowUpCapabilityFloor({
      resolvedMode: "followUp",
      resolvedCapabilities: ["hero"],
      contractCapabilities: ["stripe-checkout"],
    });
    expect(decision.capabilities).toContain("stripe-checkout");
    expect(decision.floorApplied).toBe(true);
  });

  it("is a no-op on init (no contract floor)", () => {
    const decision = enforceFollowUpCapabilityFloor({
      resolvedMode: "init",
      resolvedCapabilities: ["hero", "carousel"],
      contractCapabilities: [],
    });
    expect(decision.capabilities).toEqual(["hero", "carousel"]);
    expect(decision.floorApplied).toBe(false);
  });

  it("is a no-op for a follow-up with an empty contract floor (neutral-path parity)", () => {
    const decision = enforceFollowUpCapabilityFloor({
      resolvedMode: "followUp",
      resolvedCapabilities: ["hero"],
      contractCapabilities: [],
    });
    expect(decision.capabilities).toEqual(["hero"]);
    expect(decision.floorApplied).toBe(false);
  });

  it("normalizes (trim + lowercase + dedup) and is duplicate-safe", () => {
    const decision = enforceFollowUpCapabilityFloor({
      resolvedMode: "followUp",
      resolvedCapabilities: ["Contact-Form"],
      contractCapabilities: [" CONTACT-FORM ", "stripe-checkout", "stripe-checkout"],
    });
    expect(decision.capabilities).toEqual(["contact-form", "stripe-checkout"]);
    expect(decision.restoredCapabilities).toEqual(["stripe-checkout"]);
    expect(decision.floorApplied).toBe(true);
  });
});

describe("5-5 capabilities can-only-grow — filter + floor (proves the bug fix deterministically)", () => {
  it("restores a base contact-form that filterDossierCapabilitiesForPrompt drops on a neutral F2 follow-up", () => {
    // Drop-väg 1: init asked for a contact-form; the neutral follow-up only
    // says "change the color" → the F2 filter strips contact-form because the
    // current message doesn't request contact delivery.
    const filtered = filterDossierCapabilitiesForPrompt({
      capabilities: ["contact-form"],
      prompt: "Byt knappfärgen till blå.",
      previewPolicy: "fidelity2",
    });
    expect(filtered).not.toContain("contact-form"); // proves the filter drops it

    const decision = enforceFollowUpCapabilityFloor({
      resolvedMode: "followUp",
      resolvedCapabilities: filtered,
      contractCapabilities: ["contact-form"],
    });
    expect(decision.capabilities).toContain("contact-form"); // floor restores it
    expect(decision.floorApplied).toBe(true);
  });

  it("restores an F3-only base integration the F2 filter strips on a neutral follow-up", () => {
    const filtered = filterDossierCapabilitiesForPrompt({
      capabilities: ["payments"],
      prompt: "Gör hero-rubriken större.",
      previewPolicy: "fidelity2",
    });
    expect(filtered).not.toContain("payments");

    const decision = enforceFollowUpCapabilityFloor({
      resolvedMode: "followUp",
      resolvedCapabilities: filtered,
      contractCapabilities: ["payments"],
    });
    expect(decision.capabilities).toContain("payments");
    expect(decision.floorApplied).toBe(true);
  });
});
