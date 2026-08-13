import { describe, expect, it } from "vitest";
import {
  beginPipelineWork,
  isPipelineInteractionLocked,
  isPipelineWorkActive,
  resetPipelineWorkActivity,
} from "./pipeline-interaction-lock";

describe("isPipelineInteractionLocked", () => {
  it("låser under pågående generation/verify/repair", () => {
    expect(isPipelineInteractionLocked("generating")).toBe(true);
    expect(isPipelineInteractionLocked("verifying")).toBe(true);
    expect(isPipelineInteractionLocked("repairing")).toBe(true);
    expect(isPipelineInteractionLocked("autofixing")).toBe(true);
    expect(isPipelineInteractionLocked("validating")).toBe(true);
    expect(isPipelineInteractionLocked("preflighting")).toBe(true);
  });

  it("låser inte terminala eller tomma lägen — escape efter fail/pending", () => {
    expect(isPipelineInteractionLocked("ready")).toBe(false);
    expect(isPipelineInteractionLocked("promoted")).toBe(false);
    expect(isPipelineInteractionLocked("failed")).toBe(false);
    expect(isPipelineInteractionLocked("degraded")).toBe(false);
    expect(isPipelineInteractionLocked("blocked")).toBe(false);
    expect(isPipelineInteractionLocked("idle")).toBe(false);
    expect(isPipelineInteractionLocked("retrying")).toBe(false);
    expect(isPipelineInteractionLocked(null)).toBe(false);
  });
});

describe("beginPipelineWork", () => {
  it("håller räknaren öppen tills alla release-anrop kommit", () => {
    resetPipelineWorkActivity();
    const first = beginPipelineWork();
    const second = beginPipelineWork();
    expect(isPipelineWorkActive()).toBe(true);
    first();
    expect(isPipelineWorkActive()).toBe(true);
    first();
    expect(isPipelineWorkActive()).toBe(true);
    second();
    expect(isPipelineWorkActive()).toBe(false);
  });
});
