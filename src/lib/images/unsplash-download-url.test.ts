import { describe, expect, it } from "vitest";
import { resolveUnsplashDownloadUrl } from "./unsplash-download-url";

describe("resolveUnsplashDownloadUrl", () => {
  it("accepts a canonical Unsplash download location", () => {
    expect(
      resolveUnsplashDownloadUrl({
        downloadLocation: "https://api.unsplash.com/photos/abc123/download?ixid=1",
      }),
    ).toBe("https://api.unsplash.com/photos/abc123/download?ixid=1");
  });

  it("builds the track URL from a safe photo id", () => {
    expect(resolveUnsplashDownloadUrl({ photoId: "AbC_12-3" })).toBe(
      "https://api.unsplash.com/photos/AbC_12-3/download",
    );
  });

  it("rejects metadata, private, and lookalike hosts", () => {
    expect(
      resolveUnsplashDownloadUrl({ downloadLocation: "http://169.254.169.254/latest/meta-data" }),
    ).toBeNull();
    expect(
      resolveUnsplashDownloadUrl({ downloadLocation: "https://evil.example/photos/x/download" }),
    ).toBeNull();
    expect(
      resolveUnsplashDownloadUrl({
        downloadLocation: "https://api.unsplash.com.evil.example/photos/x/download",
      }),
    ).toBeNull();
    expect(resolveUnsplashDownloadUrl({ photoId: "../etc/passwd" })).toBeNull();
    expect(resolveUnsplashDownloadUrl({ photoId: "x/../../../admin" })).toBeNull();
  });
});
