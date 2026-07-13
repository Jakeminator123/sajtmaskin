import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { format } from "prettier";

import dossierRegistry from "../../src/lib/gen/dossiers/registry.ts";
import dossierTypes from "../../src/lib/gen/dossiers/types.ts";
import scaffoldRegistry from "../../src/lib/gen/scaffolds/registry.ts";
import variantRegistry from "../../src/lib/gen/scaffold-variants/registry.ts";
import aiModelsRuntime from "../../src/lib/ai-models/load-manifest.ts";

const { getAllDossiers } = dossierRegistry;
const { dossierRequiresF3 } = dossierTypes;
const { getAllScaffolds, getScaffoldIds } = scaffoldRegistry;
const { getVariantsForScaffold } = variantRegistry;
const { getAiModelsManifest } = aiModelsRuntime;

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GENERATED_DIR = "docs/generated";
const GENERATOR_PATH = "scripts/docs/generate-contract-docs.mjs";

function compareText(left, right) {
  return left.localeCompare(right, "en");
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

function renderPolicies(entries) {
  const rows = entries
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

  return [
    generatedHeader([
      "config/control-plane/schema-registry.json",
      "config/control-plane/policy-registry.json",
    ]),
    "# Schemas and policies",
    "",
    `This index contains ${entries.length} control-plane entries. It is a map to canonical owners, not a runtime policy layer.`,
    "",
    "| ID | Type | Canonical source | Validator | CI status | Runtime status | Runtime enforced |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

export async function buildGeneratedDocs() {
  const dossiers = getAllDossiers();
  if (dossiers.length === 0) {
    throw new Error("The runtime dossier registry returned no validated dossiers.");
  }
  const scaffolds = getAllScaffolds();
  const scaffoldIds = getScaffoldIds();
  const modelManifest = getAiModelsManifest();
  const controlPlaneEntries = await loadControlPlaneEntries();

  const rawDocs = new Map([
    [`${GENERATED_DIR}/capabilities.generated.md`, renderCapabilities(dossiers)],
    [`${GENERATED_DIR}/dossiers.generated.md`, renderDossiers(dossiers)],
    [`${GENERATED_DIR}/scaffolds.generated.md`, renderScaffolds(scaffolds)],
    [`${GENERATED_DIR}/variants.generated.md`, renderVariants(scaffoldIds)],
    [`${GENERATED_DIR}/models.generated.md`, renderModels(modelManifest)],
    [`${GENERATED_DIR}/policies.generated.md`, renderPolicies(controlPlaneEntries)],
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
