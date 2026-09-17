import { describe, expect, it } from "vitest";

import {
  canRepublish,
  isInFlightPublishState,
  isTerminalDeploymentStatus,
} from "./can-republish";
import type { SitePublishState } from "./project-client";

describe("canRepublish", () => {
  it("allows a new publish when the site is idle and nothing is watched", () => {
    const idle: SitePublishState[] = ["ready", "error", "cancelled", "never_published"];
    for (const state of idle) {
      expect(canRepublish(state)).toBe(true);
    }
  });

  it("blocks while the overview says a build is pending or building", () => {
    expect(canRepublish("pending")).toBe(false);
    expect(canRepublish("building")).toBe(false);
  });

  it("blocks while a POST is in flight or an SSE watch is active", () => {
    expect(canRepublish("ready", { republishing: true })).toBe(false);
    expect(canRepublish("ready", { watching: true })).toBe(false);
    expect(canRepublish("ready", { republishing: true, watching: true })).toBe(false);
  });

  it("does not allow a click when state is missing", () => {
    expect(canRepublish(null)).toBe(false);
    expect(canRepublish(undefined)).toBe(false);
  });
});

describe("in-flight / terminal helpers", () => {
  it("treats pending and building as in-flight", () => {
    expect(isInFlightPublishState("pending")).toBe(true);
    expect(isInFlightPublishState("building")).toBe(true);
    expect(isInFlightPublishState("ready")).toBe(false);
  });

  it("treats ready, error and cancelled as terminal SSE outcomes", () => {
    expect(isTerminalDeploymentStatus("ready")).toBe(true);
    expect(isTerminalDeploymentStatus("error")).toBe(true);
    expect(isTerminalDeploymentStatus("cancelled")).toBe(true);
    expect(isTerminalDeploymentStatus("building")).toBe(false);
    expect(isTerminalDeploymentStatus("pending")).toBe(false);
  });
});
