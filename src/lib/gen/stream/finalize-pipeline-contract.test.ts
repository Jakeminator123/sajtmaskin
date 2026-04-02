import { describe, expect, it } from "vitest";
import {
  OWN_ENGINE_FINALIZE_DEEP_PATH_PHASES,
  OWN_ENGINE_FINALIZE_FAST_PATH_PHASES,
  OWN_ENGINE_POST_STREAM_PIPELINE,
  type OwnEnginePostStreamPhaseId,
} from "./finalize-pipeline-contract";

describe("finalize-pipeline-contract", () => {
  it("lists phases in finalize order (syntax before verifier before polish)", () => {
    const ids = OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id);
    const polishAt = ids.indexOf("polish");
    const validateAt = ids.indexOf("validate_syntax");
    const verifierAt = ids.indexOf("verifier");
    expect(polishAt).toBeGreaterThan(-1);
    expect(validateAt).toBeGreaterThan(-1);
    expect(verifierAt).toBeGreaterThan(-1);
    expect(validateAt).toBeLessThan(verifierAt);
    expect(verifierAt).toBeLessThan(polishAt);
  });

  it("has stable ids for telemetry / UI", () => {
    const allowed: OwnEnginePostStreamPhaseId[] = [
      "autofix",
      "url_expand",
      "materialize_images",
      "validate_syntax",
      "verifier",
      "polish",
      "parse_merge_preflight",
    ];
    expect(OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id)).toEqual(allowed);
  });

  it("declares a fast-path subset and deep-path subset", () => {
    expect(OWN_ENGINE_FINALIZE_FAST_PATH_PHASES).toEqual([
      "autofix",
      "url_expand",
      "validate_syntax",
      "verifier",
      "polish",
      "parse_merge_preflight",
    ]);
    expect(OWN_ENGINE_FINALIZE_DEEP_PATH_PHASES).toEqual(["materialize_images"]);
  });
});
