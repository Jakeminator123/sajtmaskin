import { describe, expect, it } from "vitest";

import { createDeploymentSchema } from "./schema";

describe("createDeploymentSchema", () => {
  it.each([
    { chatId: "x".repeat(129), versionId: "ver_1" },
    { chatId: "chat_1", versionId: "x".repeat(129) },
    { chatId: "chat_1", versionId: "ver_1", projectId: "x".repeat(129) },
    { chatId: "chat_1", versionId: "ver_1", projectName: "x".repeat(101) },
  ])("rejects oversized deployment identifiers", (payload) => {
    expect(createDeploymentSchema.safeParse(payload).success).toBe(false);
  });

  it("accepts bounded deployment identifiers", () => {
    expect(
      createDeploymentSchema.safeParse({
        chatId: "chat_1",
        versionId: "ver_1",
        projectId: "project_1",
        projectName: "customer-site",
      }).success,
    ).toBe(true);
  });
});
