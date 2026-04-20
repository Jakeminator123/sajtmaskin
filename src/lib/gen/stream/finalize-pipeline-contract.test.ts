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
      "url_expand",
      "autofix",
      "validate_syntax",
      "materialize_images",
      "verifier",
      "parse_merge_preflight",
    ];
    expect(OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id)).toEqual(allowed);
  });

  it("orders url_expand before autofix so import paths see real URLs", () => {
    const ids = OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id);
    expect(ids.indexOf("url_expand")).toBeLessThan(ids.indexOf("autofix"));
  });

  it("declares a fast-only subset and deep-path subset", () => {
    expect(OWN_ENGINE_FINALIZE_FAST_ONLY_PHASES).toEqual([
      "url_expand",
      "autofix",
      "validate_syntax",
      "parse_merge_preflight",
    ]);
    expect(OWN_ENGINE_FINALIZE_DEEP_PATH_PHASES).toEqual([
      "materialize_images",
      "verifier",
    ]);
  });

  it("does not list pre_vm_typecheck as its own phase (merged into validate_syntax)", () => {
    const ids = OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id) as string[];
    expect(ids).not.toContain("pre_vm_typecheck");
    expect(OWN_ENGINE_FINALIZE_FAST_ONLY_PHASES as string[]).not.toContain(
      "pre_vm_typecheck",
    );
  });
});
