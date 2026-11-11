import { describe, expect, it } from "vitest";
import { describePreviewVersionIndicator } from "./preview-version-indicator";

describe("describePreviewVersionIndicator", () => {
  it("says nothing without a version", () => {
    expect(describePreviewVersionIndicator({ hasVersion: false, versionNumber: 2 })).toBeNull();
  });

  it("names the version once the preview shows it", () => {
    expect(
      describePreviewVersionIndicator({ hasVersion: true, versionNumber: 2, previewLifecycle: "live" }),
    ).toEqual({ text: "Visar version 2", tone: "live" });
  });

  it.each([
    ["preview pending after done", { previewPending: true }],
    ["iframe waiting for the ready receipt", { iframeLoading: true }],
    ["bootstrapping", { previewLifecycle: "bootstrapping" as const }],
    ["recovering", { previewLifecycle: "recovering" as const }],
  ])("is honest while %s: saved, preview starting", (_label, state) => {
    expect(describePreviewVersionIndicator({ hasVersion: true, versionNumber: 2, ...state })).toEqual({
      text: "Version 2 är sparad, förhandsvisningen startar",
      tone: "pending",
    });
  });

  it("never claims to show the version when the preview failed", () => {
    for (const state of [{ hasBuildError: true }, { iframeError: true }, { previewLifecycle: "failed" as const }]) {
      expect(describePreviewVersionIndicator({ hasVersion: true, versionNumber: 3, iframeLoading: true, ...state })).toEqual({
        text: "Version 3 är sparad, förhandsvisningen startade inte",
        tone: "attention",
      });
    }
  });

  it("says when the preview shows another version", () => {
    expect(
      describePreviewVersionIndicator({ hasVersion: true, versionNumber: 2, hasVersionMismatch: true }),
    ).toEqual({ text: "Version 2 är sparad, förhandsvisningen visar en annan version", tone: "attention" });
  });

  it("falls back to 'vald version' without a number", () => {
    expect(describePreviewVersionIndicator({ hasVersion: true })).toEqual({
      text: "Visar vald version",
      tone: "live",
    });
    expect(describePreviewVersionIndicator({ hasVersion: true, versionNumber: 0, iframeLoading: true })).toEqual({
      text: "Vald version är sparad, förhandsvisningen startar",
      tone: "pending",
    });
  });
});
