import { describe, expect, it } from "vitest";
import {
  OWN_ENGINE_POST_STREAM_PIPELINE,
  type OwnEnginePostStreamPhaseId,
} from "./finalize-pipeline-contract";

describe("finalize-pipeline-contract", () => {
  it("lists phases in finalize order (polish before syntax validation)", () => {
    const ids = OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id);
    const polishAt = ids.indexOf("polish");
    const validateAt = ids.indexOf("validate_syntax");
    expect(polishAt).toBeGreaterThan(-1);
    expect(validateAt).toBeGreaterThan(-1);
    expect(polishAt).toBeLessThan(validateAt);
  });

  it("has stable ids for telemetry / UI", () => {
    const allowed: OwnEnginePostStreamPhaseId[] = [
      "autofix",
      "url_expand",
      "materialize_images",
      "polish",
      "validate_syntax",
      "parse_merge_preflight",
    ];
    expect(OWN_ENGINE_POST_STREAM_PIPELINE.map((p) => p.id)).toEqual(allowed);
  });
});
