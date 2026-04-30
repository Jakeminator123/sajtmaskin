import { describe, expect, it } from "vitest";
import { buildBlobPath, generateUniqueFilename } from "./blob-service";

describe("blob-service paths", () => {
  it("sanitizes user-controlled path segments", () => {
    expect(
      buildBlobPath("user/../x", "avatar/../../evil.png", {
        projectId: "../project:42",
        category: "media",
      }),
    ).toMatch(/^user-\.\.-x\/projects\/project-42\/media\/avatar-\.\.-\.\.-evil-[a-f0-9]{8}\.png$/);
  });

  it("keeps non-latin filenames from collapsing into the same extension-only key", () => {
    const first = buildBlobPath("user-1", "😀.png");
    const second = buildBlobPath("user-1", "😎.png");

    expect(first).toMatch(/^user-1\/media\/file-[a-f0-9]{8}\.png$/);
    expect(second).toMatch(/^user-1\/media\/file-[a-f0-9]{8}\.png$/);
    expect(first).not.toBe(second);
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
