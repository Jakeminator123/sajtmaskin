import { describe, expect, it } from "vitest";

import { buildAgentActionConsentPrompt, buildOpenClawEditSystemPrompt } from "./edit-system-prompt";
import { resolveOpenClawPowersFromRequest } from "./powers";

/** What the route does with a raw request body, in one line. */
function promptFor(editEnabled: boolean, requested: unknown): string | null {
  return buildOpenClawEditSystemPrompt(
    resolveOpenClawPowersFromRequest({ editEnabled, requested }),
  );
}

describe("OpenClaw edit system prompt — server gate", () => {
  it("returns no prompt when OC_EDIT is off, whatever the client asks for", () => {
    expect(promptFor(false, ["armed_autonomy", "quick_edit"])).toBeNull();
  });

  it("returns no prompt when OC_EDIT is on but the client granted nothing", () => {
    expect(promptFor(true, [])).toBeNull();
    expect(promptFor(true, undefined)).toBeNull();
  });

  it("describes only armed autonomy when only that is granted", () => {
    const prompt = promptFor(true, ["armed_autonomy"]);
    expect(prompt).toContain("Armerad autonomi");
    // The model must not learn about a power the user did not grant — an
    // instruction it never sees is one it cannot offer.
    expect(prompt).not.toContain("apply_quick_edit");
  });

  // Heavy follow-ups (new packages → reinstall + preview restart) belong to the
  // armed lane, so the guidance must ride with that section — and only there.
  it("carries the heavy-change guidance in the armed section only", () => {
    expect(promptFor(true, ["armed_autonomy"])).toContain("Tyngre ändringar");
    expect(promptFor(true, ["quick_edit"])).not.toContain("Tyngre ändringar");
  });

  it("describes only quick edits when only that is granted", () => {
    const prompt = promptFor(true, ["quick_edit"]);
    expect(prompt).toContain("apply_quick_edit");
    expect(prompt).not.toContain("start_bug_hunt");
  });

  it("describes both when both are granted", () => {
    const prompt = promptFor(true, ["quick_edit", "armed_autonomy"]);
    expect(prompt).toContain("start_bug_hunt");
    expect(prompt).toContain("apply_quick_edit");
  });

  it("asks for the first fill instead of a confirmation-only hunt when the first step is already described", () => {
    const prompt = promptFor(true, ["armed_autonomy"]);
    expect(prompt).toContain("redan beskrivit första builder-steget");
    expect(prompt).toContain("hoppa över bekräftelsen");
    expect(prompt).toContain("fill_text_field");
    expect(prompt).toContain("Exakt ETT action-block per svar");
  });

  it("ignores unknown power names instead of widening the grant", () => {
    expect(promptFor(true, ["publish_site", "write_platform_code"])).toBeNull();
  });

  it("does not inject the edit prompt when only live_review is granted", () => {
    expect(promptFor(true, ["live_review"])).toBeNull();
  });

  it("always states that other powers are off", () => {
    const prompt = promptFor(true, ["armed_autonomy"]);
    expect(prompt).toContain("inga andra");
  });

  it("points the direct-build section at the per-turn consent line", () => {
    expect(promptFor(true, ["armed_autonomy"])).toContain("[BYGGMEDGIVANDE]");
  });
});

describe("OpenClaw edit system prompt — orkestrator (ägarbeslut 2026-11-20)", () => {
  it("tells the agent to act on a change request instead of asking for approval", () => {
    const prompt = promptFor(true, ["armed_autonomy"]);
    expect(prompt).toContain("startar du bygget själv");
    expect(prompt).toContain("fråga inte om lov");
    // The old passive rules must be gone, or the model hedges every action.
    expect(prompt).not.toContain("Du bygger ALDRIG en sajt oombett");
    expect(prompt).not.toContain("Starta inget nytt bygge på det meddelandet");
  });

  it("keeps a question, a review and hesitation as text answers", () => {
    expect(promptFor(true, ["armed_autonomy"])).toContain(
      "På en ren fråga, en granskning eller när användaren tvekar svarar du i text utan action-block",
    );
  });

  it("states the mission budget and that [Byggresultat] decides whether to continue", () => {
    const prompt = promptFor(true, ["armed_autonomy"]);
    expect(prompt).toContain("högst 3 automatiska steg");
    expect(prompt).toContain("[Byggresultat]");
  });

  it("lets a quick edit run directly but never unprompted", () => {
    const prompt = promptFor(true, ["quick_edit"]);
    expect(prompt).toContain("Gör ALDRIG en snabbändring oombett");
    expect(prompt).toContain("[BYGGMEDGIVANDE]");
    expect(prompt).not.toContain("Förslaget körs ALDRIG automatiskt");
  });
});

describe("OpenClaw action consent line", () => {
  const both = resolveOpenClawPowersFromRequest({
    editEnabled: true,
    requested: ["armed_autonomy", "quick_edit"],
  });
  const quickOnly = resolveOpenClawPowersFromRequest({
    editEnabled: true,
    requested: ["quick_edit"],
  });

  it("says an action block runs directly only when the turn allows it, and only if one is placed", () => {
    const yes = buildAgentActionConsentPrompt(true, both);
    expect(yes).toContain("[BYGGMEDGIVANDE] JA");
    expect(yes).toContain("start_build, request_repair, apply_quick_edit körs direkt");
    expect(yes).toContain("Lägg inget block på en fråga, en granskning");
    expect(yes).toContain("säg aldrig att något startar utan att lägga blocket");
  });

  it("makes the model describe a manual proposal when the turn does not allow it", () => {
    const no = buildAgentActionConsentPrompt(false, both);
    expect(no).toContain("[BYGGMEDGIVANDE] NEJ");
    expect(no).toContain("väntar på godkännande");
    expect(no).toContain("Påstå aldrig att något startar");
  });

  it("names only the actions the chat actually granted", () => {
    const yes = buildAgentActionConsentPrompt(true, quickOnly);
    expect(yes).toContain("apply_quick_edit");
    expect(yes).not.toContain("start_build");
    expect(yes).not.toContain("request_repair");
  });
});
