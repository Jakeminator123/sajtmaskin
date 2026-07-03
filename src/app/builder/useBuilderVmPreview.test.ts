import { describe, expect, it } from "vitest";
import {
  hasMatchingPreviewSessionMeta,
  shouldStartPreviewBootstrapPost,
} from "./useBuilderVmPreview";

describe("hasMatchingPreviewSessionMeta", () => {
  it("requires a session id bound to the active version", () => {
    expect(
      hasMatchingPreviewSessionMeta(
        { previewSessionId: "sbx_1", versionId: "ver_2" },
        "ver_2",
      ),
    ).toBe(true);

    expect(
      hasMatchingPreviewSessionMeta(
        { previewSessionId: "sbx_1", versionId: "ver_1" },
        "ver_2",
      ),
    ).toBe(false);

    expect(
      hasMatchingPreviewSessionMeta(
        { previewSessionId: "   ", versionId: "ver_2" },
        "ver_2",
      ),
    ).toBe(false);

    expect(hasMatchingPreviewSessionMeta(null, "ver_2")).toBe(false);
  });
});

describe("shouldStartPreviewBootstrapPost", () => {
  const key = "chat_1:ver_1";

  it("allows a first start when the key is neither in flight nor done", () => {
    expect(
      shouldStartPreviewBootstrapPost({
        key,
        isForcedRestart: false,
        doneKeys: new Set(),
        inFlightKeys: new Set(),
      }),
    ).toBe(true);
  });

  it("blocks a duplicate start while a POST is already in flight (storm guard)", () => {
    expect(
      shouldStartPreviewBootstrapPost({
        key,
        isForcedRestart: false,
        doneKeys: new Set(),
        inFlightKeys: new Set([key]),
      }),
    ).toBe(false);
  });

  it("blocks in flight even for a forced restart (never two concurrent POSTs)", () => {
    expect(
      shouldStartPreviewBootstrapPost({
        key,
        isForcedRestart: true,
        doneKeys: new Set(),
        inFlightKeys: new Set([key]),
      }),
    ).toBe(false);
  });

  it("blocks a non-forced start once the key is done", () => {
    expect(
      shouldStartPreviewBootstrapPost({
        key,
        isForcedRestart: false,
        doneKeys: new Set([key]),
        inFlightKeys: new Set(),
      }),
    ).toBe(false);
  });

  it("allows a forced restart of a done key (recover/env-restart)", () => {
    expect(
      shouldStartPreviewBootstrapPost({
        key,
        isForcedRestart: true,
        doneKeys: new Set([key]),
        inFlightKeys: new Set(),
      }),
    ).toBe(true);
  });
});
