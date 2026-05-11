import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /favicon.png", () => {
  it("redirects to the canonical SVG icon", () => {
    const response = GET(new Request("https://example.com/favicon.png"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/icon.svg");
  });
});
