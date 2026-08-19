import { describe, expect, it } from "vitest";

import {
  OPENCLAW_POWER_IDS,
  OPENCLAW_POWER_META,
  resolveOpenClawPowers,
  sanitizeOpenClawPowerIds,
  toggleOpenClawPower,
  type OpenClawPowerId,
} from "./powers";

/** The behaviour an OC_EDIT=false deployment has — nothing beyond guiding. */
const NOTHING = { armedAutonomy: false, quickEdit: false, liveReview: false, any: false };

const ALL: OpenClawPowerId[] = ["armed_autonomy", "quick_edit", "live_review"];

describe("OpenClaw powers gate matrix", () => {
  it("grants nothing when OC_EDIT is off, whatever the client claims", () => {
    expect(
      resolveOpenClawPowers({ editEnabled: false, powersOn: true, granted: ALL }),
    ).toEqual(NOTHING);
  });

  it("grants nothing when the button is not pressed, even with OC_EDIT on", () => {
    expect(
      resolveOpenClawPowers({ editEnabled: true, powersOn: false, granted: ALL }),
    ).toEqual(NOTHING);
  });

  it("grants nothing when the button is pressed but no power is ticked", () => {
    expect(
      resolveOpenClawPowers({ editEnabled: true, powersOn: true, granted: [] }),
    ).toEqual(NOTHING);
  });

  it("grants only the ticked power when both gates are open", () => {
    expect(
      resolveOpenClawPowers({
        editEnabled: true,
        powersOn: true,
        granted: ["armed_autonomy"],
      }),
    ).toEqual({ armedAutonomy: true, quickEdit: false, liveReview: false, any: true });

    expect(
      resolveOpenClawPowers({ editEnabled: true, powersOn: true, granted: ["quick_edit"] }),
    ).toEqual({ armedAutonomy: false, quickEdit: true, liveReview: false, any: true });

    // Critic-only grant: liveReview resolves but `any` stays false — the edit
    // code context, editOwned and the prepared-fill lane must not open.
    expect(
      resolveOpenClawPowers({ editEnabled: true, powersOn: true, granted: ["live_review"] }),
    ).toEqual({ armedAutonomy: false, quickEdit: false, liveReview: true, any: false });
  });

  it("grants all when all are ticked", () => {
    expect(resolveOpenClawPowers({ editEnabled: true, powersOn: true, granted: ALL })).toEqual({
      armedAutonomy: true,
      quickEdit: true,
      liveReview: true,
      any: true,
    });
  });

  it("treats a missing granted list as no powers", () => {
    for (const granted of [null, undefined]) {
      expect(resolveOpenClawPowers({ editEnabled: true, powersOn: true, granted })).toEqual(
        NOTHING,
      );
    }
  });

  // The whole promise of the feature: with the button off, the resolved flags
  // are indistinguishable from a deployment that never set OC_EDIT.
  it("resolves identically to OC_EDIT=off when the button is off", () => {
    const buttonOff = resolveOpenClawPowers({
      editEnabled: true,
      powersOn: false,
      granted: ALL,
    });
    const envOff = resolveOpenClawPowers({ editEnabled: false, powersOn: true, granted: ALL });
    expect(buttonOff).toEqual(envOff);
  });
});

describe("sanitizeOpenClawPowerIds", () => {
  it("keeps known ids in canonical order and drops duplicates", () => {
    expect(sanitizeOpenClawPowerIds(["quick_edit", "armed_autonomy", "quick_edit"])).toEqual([
      "armed_autonomy",
      "quick_edit",
    ]);
    expect(
      sanitizeOpenClawPowerIds(["live_review", "quick_edit", "armed_autonomy", "live_review"]),
    ).toEqual(["armed_autonomy", "quick_edit", "live_review"]);
  });

  it("drops unknown entries instead of failing the turn", () => {
    expect(sanitizeOpenClawPowerIds(["armed_autonomy", "publish_site", 42, null])).toEqual([
      "armed_autonomy",
    ]);
  });

  it("returns an empty list for non-array input", () => {
    for (const raw of [undefined, null, "armed_autonomy", { armed_autonomy: true }]) {
      expect(sanitizeOpenClawPowerIds(raw)).toEqual([]);
    }
  });

  // A sanitized list must be usable as-is by the resolver: anything the server
  // could not parse has to land on "fewer powers", never on a widened grant.
  it("can only narrow what OC_EDIT already allows", () => {
    const granted = sanitizeOpenClawPowerIds(["publish_site", "delete_everything"]);
    expect(
      resolveOpenClawPowers({ editEnabled: true, powersOn: true, granted }),
    ).toEqual(NOTHING);
  });
});

describe("toggleOpenClawPower", () => {
  it("adds and removes a power while keeping canonical order", () => {
    expect(toggleOpenClawPower([], "quick_edit")).toEqual(["quick_edit"]);
    expect(toggleOpenClawPower(["quick_edit"], "armed_autonomy")).toEqual([
      "armed_autonomy",
      "quick_edit",
    ]);
    expect(toggleOpenClawPower(ALL, "armed_autonomy")).toEqual(["quick_edit", "live_review"]);
  });
});

describe("power metadata", () => {
  it("labels every id so the menu cannot render a blank row", () => {
    for (const id of OPENCLAW_POWER_IDS) {
      expect(OPENCLAW_POWER_META[id]?.label).toBeTruthy();
      expect(OPENCLAW_POWER_META[id]?.description).toBeTruthy();
    }
  });

  it("uses the approved Swedish copy for live_review", () => {
    expect(OPENCLAW_POWER_META.live_review).toEqual({
      label: "Granskar sajten live",
      description:
        "Får titta på din färdiga sajt, säga vad som är fel och föreslå ändringar. Du godkänner varje ändring.",
    });
  });
});
