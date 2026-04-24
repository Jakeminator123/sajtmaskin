import { describe, expect, it } from "vitest";
import { renderCapabilityModifyHintBlock } from "./dossiers";

// Plan 11 / open-question #12: when the follow-up was classified as
// `capability-modify`, `renderCapabilityModifyHintBlock` is the dossier
// section's substitute for the suppressed "Available Dossiers" pool. It
// must instruct the LLM to mutate the existing scene file rather than
// emit a fresh shell — without this hint the model would render an
// empty section in place of the original feature.
describe("renderCapabilityModifyHintBlock — plan 11 bug 3", () => {
  it("returns nothing when no hint is supplied", () => {
    expect(renderCapabilityModifyHintBlock(null)).toEqual([]);
    expect(renderCapabilityModifyHintBlock(undefined)).toEqual([]);
  });

  it("returns nothing when capabilityIds is empty (defensive)", () => {
    expect(
      renderCapabilityModifyHintBlock({ capabilityIds: [], references: ["pricken"] }),
    ).toEqual([]);
  });

  it("emits the modify-this directive with capability ids and reference tokens", () => {
    const block = renderCapabilityModifyHintBlock({
      capabilityIds: ["visual-3d"],
      references: ["pricken", "den"],
    });
    const text = block.join("\n");
    expect(text).toContain("Modify Existing Capability");
    expect(text).toContain("Do NOT Re-Inject Dossier Shell");
    expect(text).toContain("`visual-3d`");
    expect(text).toContain("`pricken`");
    expect(text).toContain("Modify that existing file in place");
  });

  it("renders gracefully when references is empty (the user used a bare deictic)", () => {
    const block = renderCapabilityModifyHintBlock({
      capabilityIds: ["visual-3d"],
      references: [],
    });
    const text = block.join("\n");
    expect(text).toContain("`visual-3d`");
    expect(text).toContain("no explicit token captured");
  });
});
