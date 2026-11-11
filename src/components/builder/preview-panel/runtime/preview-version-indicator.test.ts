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

  it("says starting, never 'Visar', after a silent ready-timeout (loading and error both false)", () => {
    // usePreviewIframe.failTier2Ready: deadline (98 s) or ready-reload (15 s)
    // timeout sets loading=false, error=false, code=preview_ready_timeout while
    // the frame can still show the host's start page.
    expect(
      describePreviewVersionIndicator({
        hasVersion: true,
        versionNumber: 1,
        previewLifecycle: "live",
        previewPending: false,
        iframeLoading: false,
        iframeError: false,
        readyTimedOut: true,
      }),
    ).toEqual({ text: "Version 1 är sparad, förhandsvisningen startar", tone: "pending" });
  });

  it("names the version as soon as the site itself reports it is in the frame", () => {
    // Rig 2026-11-11: the site was visible 10,6 s before the receipt chain settled.
    expect(
      describePreviewVersionIndicator({
        hasVersion: true,
        versionNumber: 2,
        previewLifecycle: "live",
        iframeLoading: true,
        siteDocumentObserved: true,
      }),
    ).toEqual({ text: "Visar version 2", tone: "live" });
  });

  it("the site report never hides a failure or another version", () => {
    expect(
      describePreviewVersionIndicator({ hasVersion: true, versionNumber: 2, siteDocumentObserved: true, hasBuildError: true }),
    ).toMatchObject({ tone: "attention" });
    expect(
      describePreviewVersionIndicator({ hasVersion: true, versionNumber: 2, siteDocumentObserved: true, hasVersionMismatch: true }),
    ).toMatchObject({ tone: "attention" });
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
