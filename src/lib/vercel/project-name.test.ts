import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import { buildGeneratedVercelProjectName } from "./vercel-deploy";
import { generatedVercelProjectName, readableVercelNameSegment } from "./project-name";

describe("generatedVercelProjectName", () => {
  it("matches the deploy route for the same project", () => {
    const suffix = createHash("sha256").update("project_a").digest("hex").slice(0, 8);
    expect(generatedVercelProjectName("Min butik", suffix)).toBe(
      buildGeneratedVercelProjectName("Min butik", "project_a"),
    );
  });

  it("transliterates Swedish letters instead of dropping them", () => {
    expect(readableVercelNameSegment("Frisör i Malmö")).toBe("frisor-i-malmo");
    expect(readableVercelNameSegment("!!!")).toBe("site");
  });
});
