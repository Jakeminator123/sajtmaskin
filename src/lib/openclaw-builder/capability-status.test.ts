import { describe, expect, it } from "vitest";

import { describeBuilderCapabilityStatus } from "./capability-status";

const FAIL_CLOSED_PRODUCTION = {
  toolsProfile: "minimal" as const,
  skillsEnabled: false,
  projectNavigation: false,
  canWriteProjectFiles: false,
  writePaths: ["armed_follow_up", "approved_quick_edit"] as const,
};

function expectFailClosedProduction(
  status: ReturnType<typeof describeBuilderCapabilityStatus>,
) {
  expect(status.schemaVersion).toBe(1);
  expect(status.runtimeAuthority).toBe(false);
  expect(status.productionSajtagent.toolsProfile).toBe(FAIL_CLOSED_PRODUCTION.toolsProfile);
  expect(status.productionSajtagent.skillsEnabled).toBe(false);
  expect(status.productionSajtagent.projectNavigation).toBe(false);
  expect(status.productionSajtagent.canWriteProjectFiles).toBe(false);
  expect(status.productionSajtagent.writePaths).toEqual([
    "armed_follow_up",
    "approved_quick_edit",
  ]);
  expect(status.builderLanes.active).toBe("classic");
  expect(status.builderLanes.shadowAvailable).toBe(false);
  expect(status.builderLanes.candidateAvailable).toBe(false);
}

describe("describeBuilderCapabilityStatus", () => {
  it("defaults to classic + default_classic + none context + null identity", () => {
    const status = describeBuilderCapabilityStatus({});

    expect(status).toEqual({
      schemaVersion: 1,
      runtimeAuthority: false,
      productionSajtagent: {
        toolsProfile: "minimal",
        skillsEnabled: false,
        projectNavigation: false,
        codeContextMode: "none",
        canWriteProjectFiles: false,
        writePaths: ["armed_follow_up", "approved_quick_edit"],
      },
      builderLanes: {
        requested: "classic",
        active: "classic",
        shadowAvailable: false,
        candidateAvailable: false,
        reason: "default_classic",
      },
      boundIdentity: {
        chatId: null,
        versionId: null,
        filesRevision: null,
      },
    });
  });

  it("keeps openclaw_shadow declared but unavailable", () => {
    const status = describeBuilderCapabilityStatus({
      requestedLane: "openclaw_shadow",
    });

    expect(status.builderLanes).toEqual({
      requested: "openclaw_shadow",
      active: "classic",
      shadowAvailable: false,
      candidateAvailable: false,
      reason: "lane_unavailable",
    });
    expectFailClosedProduction(status);
  });

  it("keeps openclaw_candidate declared but unavailable", () => {
    const status = describeBuilderCapabilityStatus({
      requestedLane: "openclaw_candidate",
    });

    expect(status.builderLanes).toEqual({
      requested: "openclaw_candidate",
      active: "classic",
      shadowAvailable: false,
      candidateAvailable: false,
      reason: "lane_unavailable",
    });
    expectFailClosedProduction(status);
  });

  it("fails closed on garbage lane and garbage context mode", () => {
    const status = describeBuilderCapabilityStatus({
      requestedLane: "not-a-lane",
      codeContextMode: "everything",
    });

    expect(status.builderLanes.requested).toBe("classic");
    expect(status.builderLanes.active).toBe("classic");
    expect(status.builderLanes.reason).toBe("default_classic");
    expect(status.builderLanes.shadowAvailable).toBe(false);
    expect(status.builderLanes.candidateAvailable).toBe(false);
    expect(status.productionSajtagent.codeContextMode).toBe("none");
  });

  it("treats whitespace-only ids as null", () => {
    const status = describeBuilderCapabilityStatus({
      chatId: "   ",
      versionId: "\t",
      filesRevision: "\n",
    });

    expect(status.boundIdentity).toEqual({
      chatId: null,
      versionId: null,
      filesRevision: null,
    });
  });

  it("passes through valid bound identity", () => {
    const status = describeBuilderCapabilityStatus({
      requestedLane: "classic",
      codeContextMode: "manifest",
      chatId: "chat-abc",
      versionId: "ver-123",
      filesRevision: "rev-9",
    });

    expect(status.boundIdentity).toEqual({
      chatId: "chat-abc",
      versionId: "ver-123",
      filesRevision: "rev-9",
    });
    expect(status.productionSajtagent.codeContextMode).toBe("manifest");
    expect(status.builderLanes.requested).toBe("classic");
    expect(status.builderLanes.active).toBe("classic");
    expect(status.builderLanes.reason).toBe("default_classic");
  });

  it("keeps production flags fail-closed even when a future lane is requested", () => {
    const status = describeBuilderCapabilityStatus({
      requestedLane: "openclaw_shadow",
      codeContextMode: "full",
      chatId: "chat-1",
      versionId: "ver-1",
      filesRevision: "rev-1",
    });

    expectFailClosedProduction(status);
    expect(status.productionSajtagent.codeContextMode).toBe("full");
    expect(status.runtimeAuthority).toBe(false);
    expect(status.productionSajtagent.canWriteProjectFiles).toBe(false);
    expect(status.productionSajtagent.skillsEnabled).toBe(false);
    expect(status.productionSajtagent.projectNavigation).toBe(false);
    expect(status.productionSajtagent.toolsProfile).toBe("minimal");
  });

  it("does not leak extra input fields onto the report", () => {
    const status = describeBuilderCapabilityStatus({
      requestedLane: "classic",
      chatId: "chat-1",
      ...({ apiKey: "sk-secret", token: "leak-me" } as object),
    } as Parameters<typeof describeBuilderCapabilityStatus>[0]);

    expect(status).not.toHaveProperty("apiKey");
    expect(status).not.toHaveProperty("token");
    expect(JSON.stringify(status)).not.toContain("sk-secret");
    expect(JSON.stringify(status)).not.toContain("leak-me");
    expect(Object.keys(status)).toEqual([
      "schemaVersion",
      "runtimeAuthority",
      "productionSajtagent",
      "builderLanes",
      "boundIdentity",
    ]);
  });

  it("accepts every known code context mode and trims identity", () => {
    expect(
      describeBuilderCapabilityStatus({ codeContextMode: "light" }).productionSajtagent
        .codeContextMode,
    ).toBe("light");
    expect(
      describeBuilderCapabilityStatus({ codeContextMode: "full" }).productionSajtagent
        .codeContextMode,
    ).toBe("full");
    expect(
      describeBuilderCapabilityStatus({
        chatId: "  chat-trim  ",
        versionId: "  ver-trim  ",
        filesRevision: "  rev-trim  ",
      }).boundIdentity,
    ).toEqual({
      chatId: "chat-trim",
      versionId: "ver-trim",
      filesRevision: "rev-trim",
    });
  });
});
