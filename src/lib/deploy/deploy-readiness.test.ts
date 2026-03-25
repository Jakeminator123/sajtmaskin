import { describe, expect, it } from "vitest";
import { buildDeployReadiness } from "./deploy-readiness";

describe("buildDeployReadiness", () => {
  it("ready when no missing env and no warnings", () => {
    const r = buildDeployReadiness({ missingEnvKeys: [], preDeployWarnings: [] });
    expect(r.ready).toBe(true);
    expect(r.missingEnv).toEqual([]);
    expect(r.invalidFiles).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("not ready when env keys missing", () => {
    const r = buildDeployReadiness({
      missingEnvKeys: ["STRIPE_SECRET_KEY"],
      preDeployWarnings: [],
    });
    expect(r.ready).toBe(false);
    expect(r.missingEnv).toEqual(["STRIPE_SECRET_KEY"]);
  });

  it("passes through pre-deploy warnings without blocking ready", () => {
    const r = buildDeployReadiness({
      missingEnvKeys: [],
      preDeployWarnings: ["note: foo"],
    });
    expect(r.ready).toBe(true);
    expect(r.warnings).toEqual(["note: foo"]);
  });
});
