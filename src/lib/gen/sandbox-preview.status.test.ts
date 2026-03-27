import { describe, expect, it } from "vitest";
import { httpStatusForSandboxPreviewFailure } from "./sandbox-preview-errors";

describe("httpStatusForSandboxPreviewFailure", () => {
  it("maps repair to 422", () => {
    expect(
      httpStatusForSandboxPreviewFailure({ stage: "repair", message: "x" }),
    ).toBe(422);
  });
  it("maps install to 503", () => {
    expect(
      httpStatusForSandboxPreviewFailure({ stage: "install", message: "npm" }),
    ).toBe(503);
  });
  it("maps SANDBOX_NOT_LISTENING to 504", () => {
    expect(
      httpStatusForSandboxPreviewFailure({
        stage: "sandbox-create",
        message: "SANDBOX_NOT_LISTENING: timeout",
      }),
    ).toBe(504);
  });
});
