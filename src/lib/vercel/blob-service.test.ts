import { describe, expect, it } from "vitest";
import { buildBlobPath, generateUniqueFilename } from "./blob-service";

describe("blob-service paths", () => {
  it("sanitizes user-controlled path segments", () => {
    expect(
      buildBlobPath("user/../x", "avatar/../../evil.png", {
        projectId: "../project:42",
        category: "media",
      }),
    ).toBe("user-..-x/projects/project-42/media/avatar-..-..-evil.png");
  });

  it("does not default extensionless uploads to png", () => {
    expect(generateUniqueFilename("README")).toMatch(/\.bin$/);
  });

  it("sanitizes generated filename prefixes", () => {
    expect(generateUniqueFilename("photo.JPG", "../stock source")).toMatch(
      /^stock-source_\d+_[a-f0-9]{8}\.jpg$/,
    );
  });
});
