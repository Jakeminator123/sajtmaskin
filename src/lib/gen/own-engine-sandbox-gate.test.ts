import { describe, expect, it } from "vitest";
import { shouldRunOwnEngineSandbox } from "./own-engine-sandbox-gate";

describe("shouldRunOwnEngineSandbox", () => {
  it("is false when previewBlocked", () => {
    expect(
      shouldRunOwnEngineSandbox({
        isSandboxConfigured: true,
        previewBlocked: true,
        parsedFileCount: 3,
      }),
    ).toBe(false);
  });

  it("is false when no files", () => {
    expect(
      shouldRunOwnEngineSandbox({
        isSandboxConfigured: true,
        previewBlocked: false,
        parsedFileCount: 0,
      }),
    ).toBe(false);
  });

  it("is false when sandbox not configured", () => {
    expect(
      shouldRunOwnEngineSandbox({
        isSandboxConfigured: false,
        previewBlocked: false,
        parsedFileCount: 2,
      }),
    ).toBe(false);
  });

  it("is true when configured, not blocked, and has files", () => {
    expect(
      shouldRunOwnEngineSandbox({
        isSandboxConfigured: true,
        previewBlocked: false,
        parsedFileCount: 1,
      }),
    ).toBe(true);
  });
});
