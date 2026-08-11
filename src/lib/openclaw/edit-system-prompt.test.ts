import { describe, expect, it } from "vitest";

import { buildOpenClawEditSystemPrompt } from "./edit-system-prompt";
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

  it("ignores unknown power names instead of widening the grant", () => {
    expect(promptFor(true, ["publish_site", "write_platform_code"])).toBeNull();
  });

  it("always states that other powers are off", () => {
    const prompt = promptFor(true, ["armed_autonomy"]);
    expect(prompt).toContain("inga andra");
  });
});
