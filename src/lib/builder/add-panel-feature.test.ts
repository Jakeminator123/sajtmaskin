import { afterEach, describe, expect, it } from "vitest";
import { isAddPanelEnabled } from "./add-panel-feature";

const ORIGINAL = process.env.NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL;

describe("isAddPanelEnabled", () => {
  afterEach(() => {
    if (typeof ORIGINAL === "undefined") {
      delete process.env.NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL;
    } else {
      process.env.NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL = ORIGINAL;
    }
  });

  it("defaults to disabled when unset", () => {
    delete process.env.NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL;
    expect(isAddPanelEnabled()).toBe(false);
  });

  it("is disabled for empty / negative values", () => {
    for (const value of ["", "0", "false", "no", "off"]) {
      process.env.NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL = value;
      expect(isAddPanelEnabled()).toBe(false);
    }
  });

  it("is enabled for affirmative values", () => {
    for (const value of ["1", "true", "yes", "on"]) {
      process.env.NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL = value;
      expect(isAddPanelEnabled()).toBe(true);
    }
  });

  it("tolerates surrounding quotes/whitespace injected by deploy platforms", () => {
    process.env.NEXT_PUBLIC_SAJTMASKIN_ADD_PANEL = '  "1" ';
    expect(isAddPanelEnabled()).toBe(true);
  });
});
