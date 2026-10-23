import { afterEach, describe, expect, it } from "vitest";
import { isOpenClawSurfaceEnabledOnPage, OPENCLAW_SURFACE_BODY_ATTR } from "./surface-flag";

afterEach(() => {
  document.body.removeAttribute(OPENCLAW_SURFACE_BODY_ATTR);
});

describe("isOpenClawSurfaceEnabledOnPage", () => {
  it("är falskt utan attribut och sant bara för värdet 1", () => {
    expect(isOpenClawSurfaceEnabledOnPage()).toBe(false);
    document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "0");
    expect(isOpenClawSurfaceEnabledOnPage()).toBe(false);
    document.body.setAttribute(OPENCLAW_SURFACE_BODY_ATTR, "1");
    expect(isOpenClawSurfaceEnabledOnPage()).toBe(true);
  });
});
