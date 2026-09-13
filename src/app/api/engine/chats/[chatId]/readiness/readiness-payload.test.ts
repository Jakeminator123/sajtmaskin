import { describe, expect, it } from "vitest";
import {
  buildReleaseGateBlocker,
  buildSeoAdvisoriesFromMeta,
  buildTypecheckAdvisoryBlocker,
  withReadinessCategory,
} from "./readiness-payload";
import {
  resolveDeployReleaseGate,
  resolveDeployTypecheckAdvisoryGate,
} from "@/lib/db/engine-version-lifecycle";

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

  it("klassar version-failed som Blocker", () => {
    const item = withReadinessCategory({
      id: "version-failed",
      title: "Koden går inte att bygga än — vi försöker reparera.",
      severity: "blocker",
      action: "versions",
    });

    expect(item.category).toBe("blocker");
  });

  it("använder klarspråk utan intern gate-vokabulär i ReleaseGate-blockern", () => {
    const gate = resolveDeployReleaseGate({
      lifecycle_stage: "integrations",
      verification_state: "verifying",
      release_state: null,
    });
    const item = buildReleaseGateBlocker(gate, false);
    const blob = `${item?.title ?? ""} ${item?.detail ?? ""}`;
    expect(blob).not.toMatch(
      /quality gate|preflight|ReleaseGate|\bF2\b|\bF3\b|\btypecheck\b|\bbuild\b|\blint\b/i,
    );
    expect(item?.title).toContain("Integrationerna");
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

describe("resolveDeployTypecheckAdvisoryGate + buildTypecheckAdvisoryBlocker (F2-advisory-lås 2026-09-11)", () => {
  const designPromoted = {
    lifecycle_stage: "design",
    verification_state: "passed",
    release_state: "promoted",
  };

  it("blockerar en advisory-promotad designversion — samma villkor som deploy-API:ts 409", () => {
    const gate = resolveDeployTypecheckAdvisoryGate({
      version: designPromoted,
      latestGateAdvisoryChecks: ["typecheck"],
    });
    expect(gate.allowed).toBe(false);
    expect(gate.code).toBe("DEPLOY_TYPECHECK_ADVISORY");

    const item = buildTypecheckAdvisoryBlocker(gate, false);
    expect(item?.id).toBe("typecheck-advisory-blocks-publish");
    expect(item?.severity).toBe("blocker");
    expect(item?.action).toBe("versions");
  });

  it("släpper igenom en designversion vars senaste verdikt är en ren pass", () => {
    const gate = resolveDeployTypecheckAdvisoryGate({
      version: designPromoted,
      latestGateAdvisoryChecks: [],
    });
    expect(gate.allowed).toBe(true);
    expect(buildTypecheckAdvisoryBlocker(gate, false)).toBeNull();
  });

  it("bryr sig inte om lint-advisories — bara typecheck fäller next build", () => {
    const gate = resolveDeployTypecheckAdvisoryGate({
      version: designPromoted,
      latestGateAdvisoryChecks: ["lint"],
    });
    expect(gate.allowed).toBe(true);
  });

  it("lämnar F3/integrations till ReleaseGate", () => {
    const gate = resolveDeployTypecheckAdvisoryGate({
      version: { ...designPromoted, lifecycle_stage: "integrations" },
      latestGateAdvisoryChecks: ["typecheck"],
    });
    expect(gate.allowed).toBe(true);
  });

  it("dubblerar inte en befintlig lifecycle-blocker", () => {
    const gate = resolveDeployTypecheckAdvisoryGate({
      version: designPromoted,
      latestGateAdvisoryChecks: ["typecheck"],
    });
    expect(buildTypecheckAdvisoryBlocker(gate, true)).toBeNull();
  });

  it("använder klarspråk utan intern gate-vokabulär", () => {
    const gate = resolveDeployTypecheckAdvisoryGate({
      version: designPromoted,
      latestGateAdvisoryChecks: ["typecheck"],
    });
    const item = buildTypecheckAdvisoryBlocker(gate, false);
    const blob = `${item?.title ?? ""} ${item?.detail ?? ""}`;
    expect(blob).not.toMatch(
      /quality gate|preflight|ReleaseGate|\bF2\b|\bF3\b|\btypecheck\b|\btsc\b|\blint\b|advisory/i,
    );
    expect(item?.title).toContain("typfel");
  });
});
