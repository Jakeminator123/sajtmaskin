import { describe, expect, it } from "vitest";

import { resolveStoredEnvProjectId } from "./stored-env-project-id";

describe("stored env project ownership", () => {
  it("uses the app project even when a real external project exists", () => {
    expect(
      resolveStoredEnvProjectId({
        appProjectId: "app-project-1",
        externalProjectId: "external-v0-project",
      }),
    ).toBe("app-project-1");
  });

  it("does not send an external project id to the app-project env route", () => {
    expect(
      resolveStoredEnvProjectId({
        appProjectId: null,
        externalProjectId: "external-v0-project",
      }),
    ).toBeNull();
  });
});
