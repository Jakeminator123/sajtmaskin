import { describe, expect, it } from "vitest";
import {
  buildReleaseGateBlocker,
  buildSeoAdvisoriesFromMeta,
  withReadinessCategory,
} from "./readiness-payload";
import { resolveDeployReleaseGate } from "@/lib/db/engine-version-lifecycle";

describe("readiness payload category mapping", () => {
  it("klassar missing-metadata/missing-title som Advisory", () => {
    const advisories = buildSeoAdvisoriesFromMeta({
      issues: [
        { code: "missing-metadata", category: "non_blocking_quality_warning" },
        { code: "missing-title", category: "non_blocking_quality_warning" },
      ],
    });

    expect(advisories.map((item) => item.id)).toEqual([
      "seo-missing-metadata",
      "seo-missing-title",
    ]);
    expect(advisories.every((item) => item.category === "advisory")).toBe(true);
    expect(advisories.every((item) => item.severity === "warning")).toBe(true);
  });

  it("klassar quality-gate/typecheck-fel som Blocker", () => {
    const item = withReadinessCategory({
      id: "version-failed",
      title: "Versionen underkändes av quality gate (typecheck/build).",
      severity: "blocker",
      action: "versions",
    });

    expect(item.category).toBe("blocker");
  });
});

describe("buildReleaseGateBlocker (Ö1-paritet, A#12)", () => {
  it("blockerar en F3-version i verifying — samma villkor som deploy-API:ts 409", () => {
    const gate = resolveDeployReleaseGate({
      lifecycle_stage: "integrations",
      verification_state: "verifying",
      release_state: null,
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("DEPLOY_RELEASE_GATE_NOT_GREEN");

    const item = buildReleaseGateBlocker(gate, false);
    expect(item?.id).toBe("release-gate-not-green");
    expect(item?.severity).toBe("blocker");
    // Kontraktet: readiness `canDeploy` blir false via denna blocker →
    // UI:t kan aldrig visa grön Publicera-knapp för en ogrön F3-version.
  });

  it("släpper igenom en grön F3-version (passed)", () => {
    const gate = resolveDeployReleaseGate({
      lifecycle_stage: "integrations",
      verification_state: "passed",
      release_state: null,
    });
    expect(buildReleaseGateBlocker(gate, false)).toBeNull();
  });

  it("släpper igenom F2/design (mjuk gate — bara failed blockerar)", () => {
    const gate = resolveDeployReleaseGate({
      lifecycle_stage: "design",
      verification_state: "pending",
      release_state: null,
    });
    expect(buildReleaseGateBlocker(gate, false)).toBeNull();
  });

  it("dubblerar inte en befintlig lifecycle-blocker", () => {
    const gate = resolveDeployReleaseGate({
      lifecycle_stage: "integrations",
      verification_state: "repair_available",
      release_state: null,
    });
    expect(gate.allowed).toBe(false);
    // repair_available ger redan en lifecycle-blocker i readiness-routen.
    expect(buildReleaseGateBlocker(gate, true)).toBeNull();
  });

  it("lämnar failed till lifecycle-blockern (DEPLOY_VERSION_FAILED)", () => {
    const gate = resolveDeployReleaseGate({
      lifecycle_stage: "integrations",
      verification_state: "failed",
      release_state: null,
    });
    expect(gate.code).toBe("DEPLOY_VERSION_FAILED");
    expect(buildReleaseGateBlocker(gate, true)).toBeNull();
  });
});
