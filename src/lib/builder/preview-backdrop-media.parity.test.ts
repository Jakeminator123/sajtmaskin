import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import {
  PREVIEW_HOST_BOOT_MARKER_NAME,
  PREVIEW_HOST_BOOT_MARKER_VALUES,
} from "@/lib/capture/preview-boot-page";
import {
  PREVIEW_BACKDROP_POSTER_URL,
  PREVIEW_BACKDROP_VIDEO_SOURCES,
} from "./preview-backdrop-media";

const require = createRequire(import.meta.url);
const hostMedia = require("../../../preview-host/src/runtime/preview-backdrop-media.js") as {
  PREVIEW_BACKDROP_POSTER_URL: string;
  PREVIEW_BACKDROP_VIDEO_SOURCES: ReadonlyArray<{ src: string; type: string }>;
};
const hostPage = require("../../../preview-host/src/runtime/preview-placeholder-page.js") as {
  PREVIEW_BOOT_MARKER_NAME: string;
  PREVIEW_BOOT_MARKER_VALUES: readonly string[];
};

describe("Moving Background 2 host/app media parity", () => {
  it("keeps the Fly host on the same immutable Blob URLs as the builder backdrop", () => {
    expect(hostMedia.PREVIEW_BACKDROP_POSTER_URL).toBe(PREVIEW_BACKDROP_POSTER_URL);
    expect(hostMedia.PREVIEW_BACKDROP_VIDEO_SOURCES).toEqual([...PREVIEW_BACKDROP_VIDEO_SOURCES]);
  });

  it("keeps the boot-marker name and values aligned", () => {
    expect(hostPage.PREVIEW_BOOT_MARKER_NAME).toBe(PREVIEW_HOST_BOOT_MARKER_NAME);
    expect([...hostPage.PREVIEW_BOOT_MARKER_VALUES]).toEqual([...PREVIEW_HOST_BOOT_MARKER_VALUES]);
  });
});
