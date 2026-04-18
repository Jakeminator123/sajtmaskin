import { describe, expect, it } from "vitest";
import {
  OWN_ENGINE_FINALIZE_DEEP_PATH_PHASES,
  OWN_ENGINE_FINALIZE_FAST_ONLY_PHASES,
  OWN_ENGINE_POST_STREAM_PIPELINE,
  type OwnEnginePostStreamPhaseId,
} from "./finalize-pipeline-contract";

describe("finalize-pipeline-contract", () => {
  it("lists phases in finalize order (syntax before image materialization before verifier before parse)", () => {
    const ids = OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id);
    const imageAt = ids.indexOf("materialize_images");
    const parseAt = ids.indexOf("parse_merge_preflight");
    const validateAt = ids.indexOf("validate_syntax");
    const verifierAt = ids.indexOf("verifier");
    expect(imageAt).toBeGreaterThan(-1);
    expect(parseAt).toBeGreaterThan(-1);
    expect(validateAt).toBeGreaterThan(-1);
    expect(verifierAt).toBeGreaterThan(-1);
    expect(validateAt).toBeLessThan(imageAt);
    expect(imageAt).toBeLessThan(verifierAt);
    expect(validateAt).toBeLessThan(verifierAt);
    expect(verifierAt).toBeLessThan(parseAt);
  });

  it("has stable ids for telemetry / UI", () => {
    const allowed: OwnEnginePostStreamPhaseId[] = [
      "autofix",
      "url_expand",
      "validate_syntax",
      "pre_vm_typecheck",
      "materialize_images",
      "verifier",
      "parse_merge_preflight",
    ];
    expect(OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id)).toEqual(allowed);
  });

  it("declares a fast-only subset and deep-path subset", () => {
    expect(OWN_ENGINE_FINALIZE_FAST_ONLY_PHASES).toEqual([
      "autofix",
      "url_expand",
      "validate_syntax",
      "pre_vm_typecheck",
      "parse_merge_preflight",
    ]);
    expect(OWN_ENGINE_FINALIZE_DEEP_PATH_PHASES).toEqual([
      "materialize_images",
      "verifier",
    ]);
  });
});
