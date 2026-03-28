import { describe, expect, it } from "vitest";
import { buildChatReadiness } from "@/lib/chat-readiness";
import {
  deployReadinessBadgeClassName,
  formatDeployReadinessStatusLabel,
} from "./deploy-readiness-ui";

describe("deploy-readiness-ui", () => {
  it("formats blocked / warning / ready labels", () => {
    const oneBlocker = buildChatReadiness({
      blockers: [{ id: "a", title: "T", severity: "blocker" }],
      info: {
        versionId: "v",
        requiredEnvKeys: [],
        configuredEnvKeys: [],
        missingEnvKeys: [],
      },
    });
    expect(formatDeployReadinessStatusLabel(oneBlocker)).toBe("1 spärr");

    const twoBlockers = buildChatReadiness({
      blockers: [
        { id: "a", title: "A", severity: "blocker" },
        { id: "b", title: "B", severity: "blocker" },
      ],
      info: {
        versionId: "v",
        requiredEnvKeys: [],
        configuredEnvKeys: [],
        missingEnvKeys: [],
      },
    });
    expect(formatDeployReadinessStatusLabel(twoBlockers)).toBe("2 spärrar");

    const warn = buildChatReadiness({
      warnings: [{ id: "w", title: "W", severity: "warning" }],
      info: {
        versionId: "v",
        requiredEnvKeys: [],
        configuredEnvKeys: [],
        missingEnvKeys: [],
      },
    });
    expect(formatDeployReadinessStatusLabel(warn)).toBe("1 varning");

    const ready = buildChatReadiness({
      info: {
        versionId: "v",
        requiredEnvKeys: [],
        configuredEnvKeys: [],
        missingEnvKeys: [],
      },
    });
    expect(formatDeployReadinessStatusLabel(ready)).toBe("Redo att publicera");
  });

  it("maps tones to badge classes", () => {
    const blocked = buildChatReadiness({
      blockers: [{ id: "x", title: "X", severity: "blocker" }],
      info: {
        versionId: "v",
        requiredEnvKeys: [],
        configuredEnvKeys: [],
        missingEnvKeys: [],
      },
    });
    expect(deployReadinessBadgeClassName(blocked)).toContain("red-500");
  });
});
