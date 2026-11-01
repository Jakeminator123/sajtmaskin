import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { GET } from "./route";

describe("GET /api/geo", () => {
  it("decodes a percent-encoded city", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/geo", {
        headers: { "x-vercel-ip-city": "G%C3%B6teborg" },
      }),
    );

    await expect(response.json()).resolves.toMatchObject({ city: "Göteborg" });
  });

  it("does not fail on malformed percent encoding", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/geo", {
        headers: { "x-vercel-ip-city": "G%C3%B6teborg%ZZ" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ city: "G%C3%B6teborg%ZZ" });
  });
});
