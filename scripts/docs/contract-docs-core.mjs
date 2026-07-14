import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { format } from "prettier";

import * as dossierRegistryModule from "../../src/lib/gen/dossiers/registry.ts";
import * as dossierTypesModule from "../../src/lib/gen/dossiers/types.ts";
import * as scaffoldRegistryModule from "../../src/lib/gen/scaffolds/registry.ts";
import * as variantRegistryModule from "../../src/lib/gen/scaffold-variants/registry.ts";
import * as aiModelsRuntimeModule from "../../src/lib/ai-models/load-manifest.ts";

const dossierRegistry = dossierRegistryModule.default ?? dossierRegistryModule;
const dossierTypes = dossierTypesModule.default ?? dossierTypesModule;
const scaffoldRegistry = scaffoldRegistryModule.default ?? scaffoldRegistryModule;
const variantRegistry = variantRegistryModule.default ?? variantRegistryModule;
const aiModelsRuntime = aiModelsRuntimeModule.default ?? aiModelsRuntimeModule;
const { getAllDossiers } = dossierRegistry;
const { dossierRequiresF3 } = dossierTypes;
const { getAllScaffolds, getScaffoldIds } = scaffoldRegistry;
const { getVariantsForScaffold } = variantRegistry;
const { getAiModelsManifest } = aiModelsRuntime;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GENERATED_DIR = "docs/generated";
const GENERATOR_PATH = "scripts/docs/generate-contract-docs.mjs";

export const CONTRACT_DOC_COVERAGE = Object.freeze({
  qualityGateTiers: {
    source: "config/ai_models/manifest.json#qualityGateTiers",
    output: "docs/generated/policies.generated.md",
  },
  envPolicy: {
    source: "config/env-policy.json",
    output: "docs/generated/policies.generated.md",
  },
  strictSchemas: {
    source: "docs/schemas/strict/*.schema.json",
    output: "docs/generated/schemas.generated.md",
  },
});

function compareText(left, right) {
  return left.localeCompare(right, "en");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => compareText(left, right))
      .map(([key, nested]) => [key, stableValue(nested)]),
  );
}

function fingerprint(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex")
    .slice(0, 16);
}

function fingerprintComment(source, projection) {
  return `<!-- source-fingerprint: ${source} sha256:${fingerprint(projection)} -->`;
}

function code(value) {
  return `\`${String(value).replaceAll("`", "\\`")}\``;
}

function list(values) {
  return values.length > 0 ? values.map(code).join(", ") : "—";
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

function generatedHeader(sources) {
  return [
    "> **GENERATED FILE — DO NOT EDIT MANUALLY**",
    ">",
    ...sources.map((source) => `> Source: ${code(source)}`),
    `> Generator: ${code(GENERATOR_PATH)}`,
    "",
  ].join("\n");
}

const QUALITY_GATE_PHASE_BY_LANE = Object.freeze({
  designPreview: "F2",
  integrationsBuild: "F3",
});

function collectEnums(value, path = "$", output = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectEnums(entry, `${path}[${index}]`, output));
    return output;
  }
  if (!value || typeof value !== "object") return output;

  if (Array.isArray(value.enum)) {
    output.push({
      path: `${path}.enum`,
      values: value.enum.map((entry) => String(entry)),
    });
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key === "enum") continue;
    collectEnums(nested, `${path}.${key}`, output);
  }
  return output;
}

function topLevelRequiredFields(schema) {
  if (Array.isArray(schema.required)) {
    return schema.required.map(String);
  }
  if (!schema.properties || typeof schema.properties !== "object") return [];
  return Object.entries(schema.properties)
    .filter(([, property]) => property?.required === true)
    .map(([key]) => key)
    .sort(compareText);
}

function schemaRuntimeOwners(schema) {
  const source = schema.sourceOfTruth;
  if (!source || typeof source !== "object") return [];
  return [
    ...(Array.isArray(source.types) ? source.types : []),
    ...(Array.isArray(source.runtime) ? source.runtime : []),
  ].map(String);
}

function envPolicyProjection(envPolicy) {
  const knownEmptyOk = new Set(envPolicy.knownEmptyOk ?? []);
  const runtimeOnly = new Set(envPolicy.runtimeOnlyKeys ?? []);
  return {
    knownEmptyOk: [...knownEmptyOk].sort(compareText),
    runtimeOnlyKeys: [...runtimeOnly].sort(compareText),
    rules: (envPolicy.rules ?? [])
      .map((rule) => ({
        key: rule.key,
        classification: rule.classification,
        recommendedVercelTargets: rule.recommendedVercelTargets ?? [],
        knownEmptyOk: knownEmptyOk.has(rule.key),
        runtimeOnly: runtimeOnly.has(rule.key),
        notes: rule.notes ?? null,
      }))
      .sort((left, right) => compareText(left.key, right.key)),
  };
}

function renderCapabilities(dossiers) {
  const byCapability = new Map();
  for (const dossier of dossiers) {
    const entries = byCapability.get(dossier.capability) ?? [];
    entries.push(dossier);
    byCapability.set(dossier.capability, entries);
  }

  const rows = [...byCapability.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([capability, entries]) => {
      const sorted = entries.toSorted((left, right) => compareText(left.id, right.id));
      const defaultDossier = sorted.find((entry) => entry.defaultForCapability);
      const classes = [...new Set(sorted.map((entry) => entry.class))].sort(compareText);
      const f3Dossiers = sorted.filter(dossierRequiresF3).map((entry) => entry.id);
      const mockModes = [...new Set(sorted.map((entry) => entry.mock ?? "none"))].sort(compareText);

      return `| ${code(capability)} | ${list(sorted.map((entry) => entry.id))} | ${
        defaultDossier ? code(defaultDossier.id) : "—"
      } | ${list(classes)} | ${list(mockModes)} | ${list(f3Dossiers)} |`;
    });

  return [
    generatedHeader([
      "data/dossiers/{hard,soft}/*/manifest.json",
      "src/lib/gen/dossiers/types.ts#dossierRequiresF3",
    ]),
    "# Capabilities",
    "",
    `This index contains ${byCapability.size} capabilities derived from ${dossiers.length} validated dossier manifests.`,
    "Capability is the selection key. Dossier groups are presentation only.",
    "",
    "| Capability | Dossiers | Default dossier | Classes | F2 mock modes | F3-required dossiers |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

function renderEnvVars(dossier) {
  return list(
    (dossier.envVars ?? []).map((envVar) => {
      const required = envVar.required ? "required" : "optional";
      const enforcement = envVar.enforcement ?? "build";
      return `${envVar.key} (${required}; ${enforcement})`;
    }),
  );
}

function renderFileRoles(dossier) {
  const counts = new Map();
  for (const file of dossier.files ?? []) {
    counts.set(file.role, (counts.get(file.role) ?? 0) + 1);
  }
  return (
    [...counts.entries()]
      .sort(([left], [right]) => compareText(left, right))
      .map(([role, count]) => `${role}: ${count}`)
      .join(", ") || "—"
  );
}

function renderDossiers(dossiers) {
  const rows = dossiers
    .toSorted(
      (left, right) => compareText(left.class, right.class) || compareText(left.id, right.id),
    )
    .map(
      (dossier) =>
        `| ${code(dossier.id)} | ${dossier.label.replaceAll("|", "\\|")} | ${code(
          dossier.class,
        )} | ${code(dossier.capability)} | ${yesNo(dossier.defaultForCapability)} | ${code(
          dossier.mock ?? "none",
        )} | ${yesNo(dossierRequiresF3(dossier))} | ${renderEnvVars(dossier)} | ${list(
          dossier.dependencies ?? [],
        )} | ${renderFileRoles(dossier)} | ${code(dossier.lastVerified)} |`,
    );

  return [
    generatedHeader([
      "data/dossiers/{hard,soft}/*/manifest.json",
      "docs/schemas/strict/dossier.schema.json",
      "src/lib/gen/dossiers/registry.ts",
    ]),
    "# Dossiers",
    "",
    `This catalog contains ${dossiers.length} manifests accepted by the runtime dossier registry.`,
    "Env values and instruction text are intentionally excluded.",
    "",
    "| ID | Label | Class | Capability | Default | F2 mock | Requires F3 | Env contract | Dependencies | File roles | Last verified |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

function renderScaffolds(scaffolds) {
  const rows = scaffolds
    .toSorted((left, right) => compareText(left.id, right.id))
    .map(
      (scaffold) =>
        `| ${code(scaffold.id)} | ${scaffold.label.replaceAll("|", "\\|")} | ${
          scaffold.siteKind ? code(scaffold.siteKind) : "—"
        } | ${scaffold.complexity ? code(scaffold.complexity) : "—"} | ${list(
          scaffold.allowedBuildIntents,
        )} | ${list(scaffold.features ?? [])} | ${scaffold.files.length} |`,
    );

  return [
    generatedHeader(["src/lib/gen/scaffolds/registry.ts", "src/lib/gen/scaffolds/*/manifest.ts"]),
    "# Scaffolds",
    "",
    `This catalog contains ${scaffolds.length} runtime-registered scaffolds after registry defaults and research overrides are applied.`,
    "Scaffold file contents and prompt hints are intentionally excluded.",
    "",
    "| ID | Label | Site kind | Complexity | Build intents | Features | Runtime files |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

function renderVariants(scaffoldIds) {
  const variants = scaffoldIds
    .flatMap((scaffoldId) => getVariantsForScaffold(scaffoldId))
    .toSorted(
      (left, right) =>
        compareText(left.scaffoldId, right.scaffoldId) || compareText(left.id, right.id),
    );
  const rows = variants.map(
    (variant) =>
      `| ${code(variant.scaffoldId)} | ${code(variant.id)} | ${variant.label.replaceAll(
        "|",
        "\\|",
      )} | ${code(variant.colorMode)} | ${yesNo(variant.default)} | ${list(
        variant.fontPairings.map((pairing) => `${pairing.heading} / ${pairing.body}`),
      )} | ${variant.signatureMotif.replaceAll("|", "\\|")} |`,
  );

  return [
    generatedHeader([
      "src/lib/gen/scaffold-variants/registry.ts",
      "config/scaffold-variants/<scaffold>/<variant>.json",
    ]),
    "# Scaffold variants",
    "",
    `This catalog contains ${variants.length} variants accepted by the runtime registry for ${scaffoldIds.length} registered scaffolds.`,
    "",
    "| Scaffold | Variant | Label | Color mode | Default | Font pairings | Signature motif |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

function renderModels(manifest) {
  const profileRows = Object.keys(manifest.buildProfiles.defaults)
    .sort(compareText)
    .map(
      (profile) =>
        `| ${code(profile)} | ${code(manifest.buildProfiles.defaults[profile])} | ${code(
          manifest.buildProfiles.envKeys[profile],
        )} |`,
    );
  const qualityRows = Object.entries(manifest.qualityToOwnEngineModel)
    .sort(([left], [right]) => compareText(left, right))
    .map(([quality, model]) => `| ${code(quality)} | ${code(model)} |`);
  const assistRows = Object.keys(manifest.promptAssist.defaults)
    .sort(compareText)
    .map(
      (workload) =>
        `| ${code(workload)} | ${code(manifest.promptAssist.defaults[workload])} | ${code(
          manifest.promptAssist.envKeys[workload],
        )} |`,
    );

  return [
    generatedHeader([
      "config/ai_models/manifest.json",
      "src/lib/ai-models/load-manifest.ts#getAiModelsManifest",
    ]),
    fingerprintComment("config/ai_models/manifest.json#model-summary", {
      buildProfiles: manifest.buildProfiles,
      qualityToOwnEngineModel: manifest.qualityToOwnEngineModel,
      promptAssist: {
        defaults: manifest.promptAssist.defaults,
        envKeys: manifest.promptAssist.envKeys,
      },
    }),
    "",
    "# Models",
    "",
    "The runtime Zod loader validates this data before it reaches this document. Environment overrides still win at runtime.",
    "",
    "## Build profiles",
    "",
    "| Profile | Default model | Override env key |",
    "|---|---|---|",
    ...profileRows,
    "",
    "## Quality mapping",
    "",
    "| Quality | Own-engine model |",
    "|---|---|",
    ...qualityRows,
    "",
    "## Prompt assist",
    "",
    "| Workload | Default model | Override env key |",
    "|---|---|---|",
    ...assistRows,
    "",
  ].join("\n");
}

async function loadControlPlaneEntries() {
  const registryDir = resolve(REPO_ROOT, "config/control-plane");
  const files = (await readdir(registryDir))
    .filter((file) => file.endsWith("-registry.json"))
    .sort(compareText);
  const entries = [];

  for (const file of files) {
    const parsed = JSON.parse(await readFile(resolve(registryDir, file), "utf8"));
    if (!Array.isArray(parsed.entries)) {
      throw new Error(`config/control-plane/${file} has no entries array.`);
    }
    for (const entry of parsed.entries) {
      entries.push({ ...entry, registry: file });
    }
  }
  return entries;
}

async function loadEnvPolicy() {
  return JSON.parse(await readFile(resolve(REPO_ROOT, "config/env-policy.json"), "utf8"));
}

async function loadStrictSchemas() {
  const schemaDir = resolve(REPO_ROOT, "docs/schemas/strict");
  const files = (await readdir(schemaDir))
    .filter((file) => file.endsWith(".schema.json"))
    .sort(compareText);
  return Promise.all(
    files.map(async (file) => ({
      path: `docs/schemas/strict/${file}`,
      schema: JSON.parse(await readFile(resolve(schemaDir, file), "utf8")),
    })),
  );
}

function qualityGateProjection(manifest) {
  return Object.fromEntries(
    Object.entries(manifest.qualityGateTiers).map(([lane, checks]) => [lane, [...checks]]),
  );
}

function dossierEnvPolicyProjection(dossiers) {
  return dossiers
    .flatMap((dossier) =>
      (dossier.envVars ?? []).map((envVar) => ({
        dossierId: dossier.id,
        capability: dossier.capability,
        key: envVar.key,
        required: envVar.required,
        enforcement: envVar.enforcement ?? "build",
        mock: dossier.mock ?? "none",
      })),
    )
    .sort(
      (left, right) =>
        compareText(left.dossierId, right.dossierId) || compareText(left.key, right.key),
    );
}

function renderPolicies(entries, envPolicy, dossiers, manifest, strictSchemas) {
  const registryRows = entries
    .toSorted(
      (left, right) => compareText(left.registry, right.registry) || compareText(left.id, right.id),
    )
    .map(
      (entry) =>
        `| ${code(entry.id)} | ${code(entry.type)} | ${code(entry.sourceOfTruth)} | ${
          entry.validator ? code(entry.validator) : "—"
        } | ${code(entry.ciStatus)} | ${code(entry.runtimeStatus)} | ${yesNo(
          entry.runtimeEnforced,
        )} |`,
    );
  const gateProjection = qualityGateProjection(manifest);
  const gateRows = Object.entries(gateProjection).map(
    ([lane, checks]) =>
      `| ${code(lane)} | ${code(QUALITY_GATE_PHASE_BY_LANE[lane] ?? "unmapped")} | ${checks
        .map(code)
        .join(" → ")} |`,
  );
  const envProjection = envPolicyProjection(envPolicy);
  const envRows = envProjection.rules.map(
    (rule) =>
      `| ${code(rule.key)} | ${code(rule.classification)} | ${list(
        rule.recommendedVercelTargets,
      )} | ${yesNo(rule.knownEmptyOk)} | ${yesNo(rule.runtimeOnly)} |`,
  );
  const dossierProjection = dossierEnvPolicyProjection(dossiers);
  const dossierRows = dossierProjection.map(
    (entry) =>
      `| ${code(entry.dossierId)} | ${code(entry.capability)} | ${code(entry.key)} | ${yesNo(
        entry.required,
      )} | ${code(entry.enforcement)} | ${code(entry.mock)} |`,
  );
  const previewSchema = strictSchemas.find(
    (entry) => entry.path === "docs/schemas/strict/preview-session-contract.schema.json",
  )?.schema;
  const previewResultEnums = previewSchema
    ? collectEnums(previewSchema)
        .filter((entry) => /failureKind|advisory|warning|error/i.test(entry.path))
        .map((entry) => `${code(entry.path)}: ${list(entry.values)}`)
    : [];

  return [
    generatedHeader([
      "config/control-plane/schema-registry.json",
      "config/control-plane/policy-registry.json",
      "config/ai_models/manifest.json#qualityGateTiers",
      "config/env-policy.json",
      "data/dossiers/{hard,soft}/*/manifest.json#envVars",
    ]),
    fingerprintComment(CONTRACT_DOC_COVERAGE.qualityGateTiers.source, gateProjection),
    fingerprintComment(CONTRACT_DOC_COVERAGE.envPolicy.source, envProjection),
    fingerprintComment("data/dossiers/{hard,soft}/*/manifest.json#env-policy", dossierProjection),
    fingerprintComment("config/control-plane/*-registry.json", entries),
    "",
    "# Policies",
    "",
    "## Quality-gate tiers",
    "",
    "| Lane | Phase | Ordered checks |",
    "|---|---|---|",
    ...gateRows,
    "",
    previewResultEnums.length > 0
      ? `Structured result enums from the preview contract: ${previewResultEnums.join("; ")}.`
      : "The current preview schema exposes pass/fail results without additional result enums.",
    "",
    "## Environment policy",
    "",
    "Only key names and policy metadata are emitted. Values and secret-like note text are excluded; notes participate only in the source fingerprint.",
    "",
    "| Key | Classification | Recommended targets | Empty allowed | Runtime-only |",
    "|---|---|---|---|---|",
    ...envRows,
    "",
    "## Dossier environment enforcement",
    "",
    "| Dossier | Capability | Key | Required | Enforcement | F2 mock |",
    "|---|---|---|---|---|---|",
    ...dossierRows,
    "",
    "## Control-plane registry",
    "",
    `This index contains ${entries.length} control-plane entries. It is a map to canonical owners, not a runtime policy layer.`,
    "",
    "| ID | Type | Canonical source | Validator | CI status | Runtime status | Runtime enforced |",
    "|---|---|---|---|---|---|---|",
    ...registryRows,
    "",
  ].join("\n");
}

function schemaEnumSummary(schema) {
  const enums = collectEnums(schema);
  if (enums.length === 0) return "—";
  return enums.map((entry) => `${code(entry.path)}: ${list(entry.values)}`).join("<br>");
}

function schemaValidatorSummary(path, controlPlaneEntries) {
  const validators = controlPlaneEntries
    .filter(
      (entry) =>
        entry.sourceOfTruth === path || entry.sourceOfTruth === "docs/schemas/strict/*.schema.json",
    )
    .map((entry) => entry.validator)
    .filter(Boolean);
  return list([...new Set(validators)].sort(compareText));
}

function schemaOwnerSummary(schema) {
  const owners = schemaRuntimeOwners(schema);
  if (owners.length === 0) return "—";
  const visible = owners.slice(0, 4);
  const suffix = owners.length > visible.length ? `, +${owners.length - visible.length} more` : "";
  return `${list(visible)}${suffix}`;
}

function renderSchemas(strictSchemas, controlPlaneEntries) {
  const fingerprints = strictSchemas.map(({ path, schema }) => fingerprintComment(path, schema));
  const rows = strictSchemas.map(({ path, schema }) => {
    const id = schema.$id ?? schema.id ?? path.split("/").at(-1);
    return `| ${code(id)} | ${schema.title ? String(schema.title).replaceAll("|", "\\|") : "—"} | ${code(
      path,
    )} | ${list(topLevelRequiredFields(schema))} | ${schemaEnumSummary(
      schema,
    )} | ${schemaValidatorSummary(path, controlPlaneEntries)} | ${schemaOwnerSummary(schema)} |`;
  });

  return [
    generatedHeader(["docs/schemas/strict/*.schema.json"]),
    ...fingerprints,
    "",
    "# Strict schema overview",
    "",
    `This index summarizes ${strictSchemas.length} strict schemas without dumping their full JSON definitions.`,
    "",
    "| Schema | Title | Canonical source | Top-level required | Public enums | Validator | Runtime/schema owners |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

export async function loadContractDocInputs() {
  return {
    dossiers: getAllDossiers(),
    scaffolds: getAllScaffolds(),
    scaffoldIds: getScaffoldIds(),
    modelManifest: getAiModelsManifest(),
    controlPlaneEntries: await loadControlPlaneEntries(),
    envPolicy: await loadEnvPolicy(),
    strictSchemas: await loadStrictSchemas(),
  };
}

export async function buildGeneratedDocs(overrides = {}) {
  const inputs = { ...(await loadContractDocInputs()), ...overrides };
  const {
    dossiers,
    scaffolds,
    scaffoldIds,
    modelManifest,
    controlPlaneEntries,
    envPolicy,
    strictSchemas,
  } = inputs;
  if (dossiers.length === 0) {
    throw new Error("The runtime dossier registry returned no validated dossiers.");
  }

  const rawDocs = new Map([
    [`${GENERATED_DIR}/capabilities.generated.md`, renderCapabilities(dossiers)],
    [`${GENERATED_DIR}/dossiers.generated.md`, renderDossiers(dossiers)],
    [`${GENERATED_DIR}/scaffolds.generated.md`, renderScaffolds(scaffolds)],
    [`${GENERATED_DIR}/variants.generated.md`, renderVariants(scaffoldIds)],
    [`${GENERATED_DIR}/models.generated.md`, renderModels(modelManifest)],
    [
      `${GENERATED_DIR}/policies.generated.md`,
      renderPolicies(controlPlaneEntries, envPolicy, dossiers, modelManifest, strictSchemas),
    ],
    [`${GENERATED_DIR}/schemas.generated.md`, renderSchemas(strictSchemas, controlPlaneEntries)],
  ]);
  const docs = new Map();
  for (const [path, contents] of rawDocs) {
    docs.set(path, await format(contents, { parser: "markdown" }));
  }
  return docs;
}

export async function writeGeneratedDocs() {
  const docs = await buildGeneratedDocs();
  for (const [path, contents] of docs) {
    const absolutePath = resolve(REPO_ROOT, path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
    console.log(`[docs:generate] wrote ${path}`);
  }
}

export async function findContractDocDrift(options = {}) {
  const expectedDocs = options.expectedDocs ?? (await buildGeneratedDocs());
  const readCommitted =
    options.readCommitted ?? ((path) => readFile(resolve(REPO_ROOT, path), "utf8"));
  const drift = [];

  for (const [path, expected] of expectedDocs) {
    let actual;
    try {
      actual = await readCommitted(path);
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        drift.push({ path, reason: "missing" });
        continue;
      }
      throw error;
    }
    if (actual !== expected) drift.push({ path, reason: "out of date" });
  }
  return drift;
}
