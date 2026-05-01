import { describe, expect, it } from "vitest";
import { buildChatReadiness } from "@/lib/chat-readiness";
import {
  deployReadinessBadgeClassName,
  envKeysForReadinessItem,
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

  it("resolves env-panel keys per readiness item provenance", () => {
    const info = {
      versionId: "v",
      requiredEnvKeys: [
        "STRIPE_SECRET_KEY",
        "RESEND_API_KEY",
        "CONTACT_EMAIL_TO",
      ],
      configuredEnvKeys: [],
      missingEnvKeys: ["STRIPE_SECRET_KEY"],
      buildBlockingKeys: ["STRIPE_SECRET_KEY"],
      placeholderCoveredKeys: ["RESEND_API_KEY"],
      featureRuntimeKeys: ["CONTACT_EMAIL_TO"],
    };

    expect(
      envKeysForReadinessItem(
        { id: "missing-env", title: "Missing", severity: "blocker" },
        info,
      ),
    ).toEqual(["STRIPE_SECRET_KEY"]);
    expect(
      envKeysForReadinessItem(
        { id: "placeholder-env", title: "Placeholder", severity: "warning" },
        info,
      ),
    ).toEqual(["RESEND_API_KEY"]);
    expect(
      envKeysForReadinessItem(
        { id: "feature-runtime-env", title: "Feature", severity: "warning" },
        info,
      ),
    ).toEqual(["CONTACT_EMAIL_TO"]);
  });

  it("uses explicit env keys on readiness items before fallback buckets", () => {
    expect(
      envKeysForReadinessItem(
        {
          id: "placeholder-env",
          title: "Placeholder",
          severity: "warning",
          envKeys: ["EXPLICIT_KEY"],
        },
        {
          versionId: "v",
          requiredEnvKeys: [],
          configuredEnvKeys: [],
          missingEnvKeys: [],
          placeholderCoveredKeys: ["FALLBACK_KEY"],
        },
      ),
    ).toEqual(["EXPLICIT_KEY"]);
  });
});
