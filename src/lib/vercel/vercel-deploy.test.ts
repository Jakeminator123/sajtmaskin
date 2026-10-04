import { describe, expect, it } from "vitest";
import { sanitizeVercelProjectName, toVercelFilesFromTextFiles } from "./vercel-deploy";
import { encodeImportedBinaryContent } from "@/lib/import/extract-imported-archive";

describe("imported binary deployment", () => {
  it.each(["public/logo.png", "public/fonts/site.woff2", "public/document.pdf", "public/video.mp4", "public/custom.asset"])("preserves decoded bytes for %s", (name) => {
    const bytes = Buffer.from([137, 80, 78, 71, 0, 255]);
    const files = [{ name, content: encodeImportedBinaryContent(bytes) }];
    const before = JSON.stringify(files);
    const deployed = toVercelFilesFromTextFiles(files)[0];
    expect(Buffer.from(deployed.data, "base64")).toEqual(bytes);
    expect(JSON.stringify(files)).toBe(before);
  });
  it("does not decode text or malformed binary envelopes", () => {
    for (const [name, content] of [["README.md", "base64:YWJj"], ["public/mark.svg", "base64:YWJj"], ["public/logo.png", "base64:not valid"]]) {
      expect(Buffer.from(toVercelFilesFromTextFiles([{ name, content }])[0].data, "base64").toString("utf8")).toBe(content);
    }
    const source = { name: "public/asset.custom", content: "base64:YWJj", language: "text" };
    expect(Buffer.from(toVercelFilesFromTextFiles([source])[0].data, "base64").toString("utf8")).toBe(source.content);
  });
});

describe("sanitizeVercelProjectName", () => {
  it("normalizes to a valid lowercase hyphenated slug", () => {
    expect(sanitizeVercelProjectName("My Cool Site!!")).toBe("my-cool-site");
    expect(sanitizeVercelProjectName("  Åäö Bistro  ")).toBe("bistro");
  });

  it("truncates overly long names without trailing hyphen", () => {
    const result = sanitizeVercelProjectName("a".repeat(80));
    expect(result.length).toBeLessThanOrEqual(52);
    expect(result.endsWith("-")).toBe(false);
  });

  it("uses a collision-safe random fallback when no valid slug remains (U#69)", () => {
    const a = sanitizeVercelProjectName("!!!");
    const b = sanitizeVercelProjectName("###");
    expect(a).toMatch(/^sajtmaskin-[a-f0-9]{8}$/);
    expect(b).toMatch(/^sajtmaskin-[a-f0-9]{8}$/);
    // Two empty inputs must not collide on a shared timestamp.
    expect(a).not.toBe(b);
  });
});
