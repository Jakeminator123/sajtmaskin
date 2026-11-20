import { describe, expect, it } from "vitest";
import { isBootingPinnedSession } from "./preview-boot-state";

describe("isBootingPinnedSession", () => {
  it.each([
    ["fresh start, boot not yet recorded", { running: false, readinessState: null, hostStatus: "starting" }, true],
    ["boot recorded as starting", { running: false, readinessState: "starting", hostStatus: "starting" }, true],
    ["update in progress", { running: false, readinessState: "starting", hostStatus: "warm_project" }, true],
    ["dead process, host /status reboots it", { running: false, readinessState: "ready", hostStatus: "warm_project" }, true],
    ["already running is a normal resume, not this path", { running: true, readinessState: "starting", hostStatus: "starting" }, false],
    ["failed readiness", { running: false, readinessState: "failed", hostStatus: "warm_project" }, false],
    ["boot-failure loop", { running: false, readinessState: "starting", hostStatus: "error" }, false],
    ["hibernated", { running: false, readinessState: "ready", hostStatus: "hibernated" }, false],
    ["older host without boot state", { running: false, readinessState: null, hostStatus: null }, false],
    ["older host without status field", { running: false, readinessState: null }, false],
  ] as const)("%s", (_label, verdict, expected) => {
    expect(isBootingPinnedSession(verdict)).toBe(expected);
  });
});
