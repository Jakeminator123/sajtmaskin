import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

describe("OpenClaw P1 read-only architecture", () => {
  it("keeps the production source passive and outside mutation/resume paths", () => {
    const implementation = source("./source.ts");
    for (const forbidden of [
      "getVersionFilesSnapshot",
      "updateVersionFiles",
      "saveRepairedFiles",
      "tryResumeTier2Runtime",
      "fetchPreviewHostReadinessVerdict",
      "applyPreviewReadinessOutcome",
      "touchPreviewSession",
      "getActivePreviewSessionAsync",
      "child_process",
      "node:fs",
    ]) {
      expect(implementation).not.toContain(forbidden);
    }
    expect(implementation).toContain("peekActivePreviewSessionAsync");
    expect(implementation).toContain("fetchPreviewHostFilesManifest");
  });

  it("keeps project reads bound to the in-memory version snapshot", () => {
    const implementation = source("./project-files.ts");
    expect(implementation).not.toContain("node:fs");
    expect(implementation).not.toContain("child_process");
    expect(implementation).not.toContain("fetch(");
    expect(implementation).not.toContain("process.env");
  });

  it("exposes only the validated session factory, never a public constructor", () => {
    const implementation = source("./broker.ts");
    expect(implementation).not.toContain("export class OpenClawReadToolSession");
    expect(implementation).toContain("createOpenClawReadToolSession");
  });
});
