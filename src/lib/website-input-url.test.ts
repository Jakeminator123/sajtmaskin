import { describe, expect, it } from "vitest";
import { normalizeWebsiteInputUrl } from "./website-input-url";

describe("normalizeWebsiteInputUrl", () => {
  it.each([
    ["Workershotel.se", "https://workershotel.se/"],
    ["workershotel.se", "https://workershotel.se/"],
    ["www.workershotel.se", "https://www.workershotel.se/"],
    ["https://workershotel.se", "https://workershotel.se/"],
    [" HTTPS://Workershotel.se ", "https://workershotel.se/"],
    [" HTTP://Workershotel.se ", "http://workershotel.se/"],
    [" workershotel.se ", "https://workershotel.se/"],
    ["workershotel.se:8443/Rooms", "https://workershotel.se:8443/Rooms"],
    ["localhost:3000/path", "https://localhost:3000/path"],
    [
      " Workershotel.se/Rooms/?ref=partner&b=2&a=1#details ",
      "https://workershotel.se/Rooms/?ref=partner&b=2&a=1#details",
    ],
  ])("normalizes %s without losing path or query", (input, expected) => {
    expect(normalizeWebsiteInputUrl(input)).toBe(expected);
  });

  it.each([
    "file:///etc/passwd",
    "FILE:///etc/passwd",
    "ftp://workershotel.se",
    "javascript:alert(1)",
    "javascript:1234",
    "data:text/plain,hello",
  ])("rejects explicit unsupported scheme: %s", (input) => {
    expect(() => normalizeWebsiteInputUrl(input)).toThrow(/http:\/\/ och https:\/\//);
  });

  it.each(["", "   ", "not a url", "https://", "https://user:secret@workershotel.se"])(
    "rejects invalid or credential-bearing input: %s",
    (input) => {
      expect(() => normalizeWebsiteInputUrl(input)).toThrow();
    },
  );
});
