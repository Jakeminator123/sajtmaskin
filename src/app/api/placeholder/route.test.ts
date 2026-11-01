import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

describe("GET /api/placeholder", () => {
  it("rejects partial dimensions and bounds label output", async () => {
    const label = "x".repeat(250);
    const response = await GET(
      new NextRequest(
        `http://localhost/api/placeholder?width=100px&height=250&label=${label}`,
      ),
    );
    const svg = await response.text();

    expect(svg).toContain('width="600" height="250"');
    expect(svg).toContain("x".repeat(200));
    expect(svg).not.toContain("x".repeat(201));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("escapes label markup", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/placeholder?label=%3Cscript%3Ealert(1)%3C%2Fscript%3E"),
    );
    const svg = await response.text();

    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
});
