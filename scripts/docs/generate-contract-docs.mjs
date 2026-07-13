import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { format } from "prettier";

import dossierRegistry from "../../src/lib/gen/dossiers/registry.ts";
import dossierTypes from "../../src/lib/gen/dossiers/types.ts";

const { getAllDossiers } = dossierRegistry;
const { dossierRequiresF3 } = dossierTypes;

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

export async function buildGeneratedDocs() {
  const dossiers = getAllDossiers();
  if (dossiers.length === 0) {
    throw new Error("The runtime dossier registry returned no validated dossiers.");
  }

  const rawDocs = new Map([
    [`${GENERATED_DIR}/capabilities.generated.md`, renderCapabilities(dossiers)],
    [`${GENERATED_DIR}/dossiers.generated.md`, renderDossiers(dossiers)],
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

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await writeGeneratedDocs();
}
