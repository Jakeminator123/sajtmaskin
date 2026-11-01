import { describe, expect, it } from "vitest";
import { urlForLog } from "./url-for-log";

describe("urlForLog", () => {
  it("removes credentials, query parameters and fragments", () => {
    expect(urlForLog("https://user:secret@example.com/path?q=token#private")).toBe(
      "https://example.com/path",
    );
  });

  it("returns a constant marker for invalid URLs", () => {
    expect(urlForLog("not a url\r\nforged-log-line")).toBe("[invalid-url]");
  });
});
