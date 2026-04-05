import { describe, expect, it } from "vitest";
import {
  previewUrlField,
  readPreviewUrl,
  resolveInboundPreviewUrl,
} from "./preview-url-contract";

describe("preview-url-contract", () => {
  it("previewUrlField normalizes empty to null", () => {
    expect(previewUrlField("https://a.test")).toEqual({ previewUrl: "https://a.test" });
    expect(previewUrlField(null)).toEqual({ previewUrl: null });
    expect(previewUrlField("")).toEqual({ previewUrl: null });
  });

  it("readPreviewUrl reads canonical key only", () => {
    expect(readPreviewUrl({ previewUrl: " https://p.test " })).toBe("https://p.test");
    expect(readPreviewUrl({ demoUrl: "https://ignored.test" } as { previewUrl?: string })).toBeNull();
  });

  it("resolveInboundPreviewUrl prefers previewUrl then sandboxUrl then demoUrl", () => {
    expect(
      resolveInboundPreviewUrl({
        previewUrl: " https://p.test ",
        sandboxUrl: "https://sandbox.test",
        demoUrl: "https://d.test",
      }),
    ).toBe("https://p.test");
    expect(resolveInboundPreviewUrl({ sandboxUrl: "https://sandbox.test" })).toBe(
      "https://sandbox.test",
    );
    expect(resolveInboundPreviewUrl({ demoUrl: "https://legacy.test" })).toBe("https://legacy.test");
  });
});
