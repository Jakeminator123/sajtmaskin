// @ts-nocheck -- JavaScript generator module is executed through tsx at runtime.
import { beforeAll, describe, expect, it } from "vitest";

import {
  buildGeneratedDocs,
  findContractDocDrift,
  loadContractDocInputs,
} from "./contract-docs-core.mjs";

let inputs;
let baselineDocs;

beforeAll(async () => {
  inputs = await loadContractDocInputs();
  baselineDocs = await buildGeneratedDocs(inputs);
});

describe("contract docs source coverage", () => {
  it("changes policy output when qualityGateTiers changes", async () => {
    const modelManifest = structuredClone(inputs.modelManifest);
    modelManifest.qualityGateTiers.integrationsBuild = [
      ...modelManifest.qualityGateTiers.integrationsBuild,
    ].reverse();

    const changed = await buildGeneratedDocs({ modelManifest });

    expect(changed.get("docs/generated/policies.generated.md")).not.toBe(
      baselineDocs.get("docs/generated/policies.generated.md"),
    );
  });

  it("changes policy output when a relevant env-policy field changes", async () => {
    const envPolicy = structuredClone(inputs.envPolicy);
    envPolicy.rules[0].notes = `${envPolicy.rules[0].notes ?? ""} changed`;

    const changed = await buildGeneratedDocs({ envPolicy });

    expect(changed.get("docs/generated/policies.generated.md")).not.toBe(
      baselineDocs.get("docs/generated/policies.generated.md"),
    );
  });

  it("changes schema output when preview-session schema changes", async () => {
    const strictSchemas = structuredClone(inputs.strictSchemas);
    const previewSchema = strictSchemas.find(
      (entry) => entry.path === "docs/schemas/strict/preview-session-contract.schema.json",
    );
    expect(previewSchema).toBeDefined();
    previewSchema.schema.title = `${previewSchema.schema.title} changed`;

    const changed = await buildGeneratedDocs({ strictSchemas });

    expect(changed.get("docs/generated/schemas.generated.md")).not.toBe(
      baselineDocs.get("docs/generated/schemas.generated.md"),
    );
  });

  it("reports stale committed output", async () => {
    const expectedDocs = new Map([["docs/generated/example.generated.md", "expected"]]);
    const drift = await findContractDocDrift({
      expectedDocs,
      readCommitted: async () => "stale",
    });

    expect(drift).toEqual([
      {
        path: "docs/generated/example.generated.md",
        reason: "out of date",
      },
    ]);
  });

  it("matches committed output and regenerates deterministically", async () => {
    const secondBuild = await buildGeneratedDocs(inputs);

    expect([...secondBuild]).toEqual([...baselineDocs]);
    expect(await findContractDocDrift()).toEqual([]);
  });
});
