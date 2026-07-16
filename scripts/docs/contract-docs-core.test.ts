import { beforeAll, describe, expect, it } from "vitest";

import {
  buildGeneratedDocs,
  EXPECTED_GENERATED_DOC_PATHS,
  findContractDocDrift,
  GENERATED_DOC_FAMILIES,
  loadContractDocInputs,
} from "./contract-docs-core.mjs";

type ContractDocInputs = Awaited<ReturnType<typeof loadContractDocInputs>>;
type GeneratedDocs = Awaited<ReturnType<typeof buildGeneratedDocs>>;

let inputs: ContractDocInputs;
let baselineDocs: GeneratedDocs;

beforeAll(async () => {
  inputs = await loadContractDocInputs();
  baselineDocs = await buildGeneratedDocs(inputs);
});

describe("contract docs source coverage", () => {
  it("declares and renders exactly the seven generated families", () => {
    const declared = Object.values(GENERATED_DOC_FAMILIES)
      .map((entry) => entry.output)
      .sort();

    expect(declared).toEqual(EXPECTED_GENERATED_DOC_PATHS);
    expect([...baselineDocs.keys()].sort()).toEqual(EXPECTED_GENERATED_DOC_PATHS);
  });

  it("changes capability output when dossier capability ownership changes", async () => {
    const dossiers = structuredClone(inputs.dossiers);
    const dossier = dossiers[0];
    if (!dossier) throw new Error("expected at least one dossier");
    dossier.capability = `${dossier.capability}-changed`;

    const changed = await buildGeneratedDocs({ dossiers });

    expect(changed.get(GENERATED_DOC_FAMILIES.capabilities.output)).not.toBe(
      baselineDocs.get(GENERATED_DOC_FAMILIES.capabilities.output),
    );
  });

  it("changes dossier output when a dossier manifest field changes", async () => {
    const dossiers = structuredClone(inputs.dossiers);
    const dossier = dossiers[0];
    if (!dossier) throw new Error("expected at least one dossier");
    dossier.label = `${dossier.label} changed`;

    const changed = await buildGeneratedDocs({ dossiers });

    expect(changed.get(GENERATED_DOC_FAMILIES.dossiers.output)).not.toBe(
      baselineDocs.get(GENERATED_DOC_FAMILIES.dossiers.output),
    );
  });

  it("changes scaffold output when a scaffold manifest field changes", async () => {
    const scaffolds = structuredClone(inputs.scaffolds);
    const scaffold = scaffolds[0];
    if (!scaffold) throw new Error("expected at least one scaffold");
    scaffold.label = `${scaffold.label} changed`;

    const changed = await buildGeneratedDocs({ scaffolds });

    expect(changed.get(GENERATED_DOC_FAMILIES.scaffolds.output)).not.toBe(
      baselineDocs.get(GENERATED_DOC_FAMILIES.scaffolds.output),
    );
  });

  it("changes variant output when a variant source field changes", async () => {
    const variants = structuredClone(inputs.variants);
    const variant = variants[0];
    if (!variant) throw new Error("expected at least one variant");
    variant.label = `${variant.label} changed`;

    const changed = await buildGeneratedDocs({ variants });

    expect(changed.get(GENERATED_DOC_FAMILIES.variants.output)).not.toBe(
      baselineDocs.get(GENERATED_DOC_FAMILIES.variants.output),
    );
  });

  it("changes model output when a model manifest field changes", async () => {
    const modelManifest = structuredClone(inputs.modelManifest);
    const [profile] = Object.keys(modelManifest.buildProfiles.defaults);
    if (!profile) throw new Error("expected at least one model profile");
    modelManifest.buildProfiles.defaults[profile] =
      `${modelManifest.buildProfiles.defaults[profile]}-changed`;

    const changed = await buildGeneratedDocs({ modelManifest });

    expect(changed.get(GENERATED_DOC_FAMILIES.models.output)).not.toBe(
      baselineDocs.get(GENERATED_DOC_FAMILIES.models.output),
    );
  });

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
    if (!previewSchema) throw new Error("preview-session schema missing");
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
      listCommitted: async () => ["docs/generated/example.generated.md"],
    });

    expect(drift).toEqual([
      {
        path: "docs/generated/example.generated.md",
        reason: "out of date",
      },
    ]);
  });

  it("reports missing committed output", async () => {
    const expectedDocs = new Map([["docs/generated/example.generated.md", "expected"]]);
    const missing = Object.assign(new Error("missing"), { code: "ENOENT" });
    const drift = await findContractDocDrift({
      expectedDocs,
      readCommitted: async () => {
        throw missing;
      },
      listCommitted: async () => [],
    });

    expect(drift).toEqual([
      {
        path: "docs/generated/example.generated.md",
        reason: "missing",
      },
    ]);
  });

  it("reports unexpected orphan generated output", async () => {
    const expectedDocs = new Map([["docs/generated/example.generated.md", "expected"]]);
    const drift = await findContractDocDrift({
      expectedDocs,
      readCommitted: async () => "expected",
      listCommitted: async () => [
        "docs/generated/example.generated.md",
        "docs/generated/orphan.generated.md",
      ],
    });

    expect(drift).toEqual([
      {
        path: "docs/generated/orphan.generated.md",
        reason: "unexpected",
      },
    ]);
  });

  it("loads repository-owned inputs independently of the caller cwd", async () => {
    const previousCwd = process.cwd();
    process.chdir("scripts/docs");
    try {
      const nestedInputs = await loadContractDocInputs();
      expect(nestedInputs.dossiers.length).toBe(inputs.dossiers.length);
      expect(nestedInputs.variants.length).toBe(inputs.variants.length);
      expect(nestedInputs.strictSchemas.length).toBe(inputs.strictSchemas.length);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it("matches committed output and regenerates deterministically", async () => {
    const secondBuild = await buildGeneratedDocs(inputs);

    expect([...secondBuild]).toEqual([...baselineDocs]);
    expect(await findContractDocDrift()).toEqual([]);
  });
});
