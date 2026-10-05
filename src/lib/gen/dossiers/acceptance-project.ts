import { buildCompleteProject } from "@/lib/gen/export/project-scaffold";
import { collectRequiredUiComponents } from "@/lib/gen/export/project-scaffold-ui-reader";
import type { CodeFile } from "@/lib/gen/parser";
import { loadScaffoldFiles } from "@/lib/gen/scaffolds/load-scaffold-files";
import { inferFileLanguage } from "@/lib/utils/infer-file-language";
import {
  isBuiltinPackage,
  parseManifestDependencySpec,
  resolveExportableVersion,
} from "@/lib/gen/autofix/dep-completer";
import {
  dossierOutputPathIdentity,
  dossierOutputPathsHaveFileDirectoryConflict,
  resolveDossierFilePath,
} from "./output-path";
import { getDossierById, getDossierFileContent } from "./registry";
import type { DossierEntry } from "./types";

export interface DossierAcceptanceProject {
  dossier: DossierEntry;
  scaffoldId: DossierAcceptanceScaffoldId;
  files: CodeFile[];
}

type DossierAcceptanceScaffoldId = "landing-page" | "ecommerce" | "dashboard" | "blog";

const ACCEPTANCE_SCAFFOLD_BY_DOSSIER_ID: Readonly<
  Partial<Record<string, DossierAcceptanceScaffoldId>>
> = {
  "stripe-checkout": "ecommerce",
  "postgres-drizzle": "dashboard",
  "mailchimp-newsletter": "blog",
};

const ACCEPTANCE_MOUNT_PATH = "app/dossier-acceptance/page.tsx";

const ACCEPTANCE_MOUNT_BY_DOSSIER_ID: Readonly<Partial<Record<string, string>>> = {
  "stripe-checkout": `import { CheckoutButton } from "@/components/checkout-button";

export default function DossierAcceptancePage() {
  return <CheckoutButton priceId="" />;
}
`,
  "postgres-drizzle": `import { DbConfigNotice } from "@/components/db-config-notice";
import { seedData } from "@/lib/db/seed-data";

export default function DossierAcceptancePage() {
  return (
    <main>
      <DbConfigNotice />
      <p>Seed rows: {seedData.length}</p>
    </main>
  );
}
`,
  "mailchimp-newsletter": `import { NewsletterForm } from "@/components/newsletter-form";

export default function DossierAcceptancePage() {
  return <NewsletterForm />;
}
`,
};

function asCodeFile(path: string, content: string): CodeFile {
  return { path, content, language: inferFileLanguage(path) };
}

function assertAcceptanceOutputCanMaterialize(
  byPath: ReadonlyMap<string, CodeFile>,
  outputPath: string,
  dossierId: string,
): void {
  const existingIdentity = byPath.get(dossierOutputPathIdentity(outputPath));
  if (existingIdentity && existingIdentity.path !== outputPath) {
    throw new Error(
      `${dossierId}: acceptance-output-conflict: ${outputPath} aliases ${existingIdentity.path}`,
    );
  }
  for (const existing of byPath.values()) {
    if (
      existing.path !== outputPath &&
      dossierOutputPathsHaveFileDirectoryConflict(existing.path, outputPath)
    ) {
      throw new Error(
        `${dossierId}: acceptance-output-conflict: ${outputPath} has a file/directory conflict with ${existing.path}`,
      );
    }
  }
}

/**
 * Materialize the same keyless generated-project shape that scheduled dossier
 * acceptance builds use. The dossier may replace an exact literal path in the
 * selected existing scaffold fixture; portable aliases and file/directory conflicts
 * are rejected before materialization. Export baseline completion then supplies
 * package, tsconfig and framework files exactly as a generated user project
 * receives them.
 *
 * Covers every dossier that SHIPS FILES — hard and soft alike. The former
 * hard-only guard left soft verbatim components without any typecheck against
 * their pinned dependencies, which is exactly how `maplibre-map`'s
 * `.default`-import rotted unnoticed when maplibre-gl v6 dropped its default
 * export (prod chat 3a6c5472, 2026-08-05). A dossier with zero files has
 * nothing to build and is still rejected.
 */
export function buildDossierAcceptanceProject(dossierId: string): DossierAcceptanceProject {
  const dossier = getDossierById(dossierId);
  if (!dossier) throw new Error(`Unknown dossier: ${dossierId}`);
  if ((dossier.files ?? []).length === 0) {
    throw new Error(`Acceptance build requires a dossier with declared files: ${dossierId}`);
  }

  const scaffoldId = ACCEPTANCE_SCAFFOLD_BY_DOSSIER_ID[dossier.id] ?? "landing-page";
  const byPath = new Map<string, CodeFile>();
  for (const file of loadScaffoldFiles(scaffoldId)) {
    byPath.set(dossierOutputPathIdentity(file.path), asCodeFile(file.path, file.content));
  }
  for (const file of dossier.files ?? []) {
    const content = getDossierFileContent(dossier.class, dossier.id, file.path);
    if (content === null) {
      throw new Error(`${dossier.id}: declared file could not be read: ${file.path}`);
    }
    const outputPath = resolveDossierFilePath(file.path).outputPath;
    assertAcceptanceOutputCanMaterialize(byPath, outputPath, dossier.id);
    byPath.set(dossierOutputPathIdentity(outputPath), asCodeFile(outputPath, content));
  }
  const acceptanceMount = ACCEPTANCE_MOUNT_BY_DOSSIER_ID[dossier.id];
  if (acceptanceMount) {
    const mountIdentity = dossierOutputPathIdentity(ACCEPTANCE_MOUNT_PATH);
    if (byPath.has(mountIdentity)) {
      throw new Error(
        `${dossier.id}: acceptance-harness-conflict: ${ACCEPTANCE_MOUNT_PATH} is already materialized`,
      );
    }
    assertAcceptanceOutputCanMaterialize(byPath, ACCEPTANCE_MOUNT_PATH, dossier.id);
    byPath.set(mountIdentity, asCodeFile(ACCEPTANCE_MOUNT_PATH, acceptanceMount));
  }

  const generatedFiles = Array.from(byPath.values());
  const files = buildCompleteProject(generatedFiles, collectRequiredUiComponents(generatedFiles));
  const packageFile = files.find((file) => file.path === "package.json");
  if (!packageFile) throw new Error(`${dossier.id}: materialized project lacks package.json`);
  const packageJson = JSON.parse(packageFile.content) as {
    name?: string;
    private?: boolean;
    dependencies?: Record<string, string>;
  };
  const dependencies = { ...(packageJson.dependencies ?? {}) };
  for (const raw of dossier.dependencies ?? []) {
    const { pkg } = parseManifestDependencySpec(raw);
    if (!pkg || isBuiltinPackage(pkg)) continue;
    const range = resolveExportableVersion(pkg);
    if (!range || range === "latest" || range === "*") {
      throw new Error(`${dossier.id}: no deterministic export range for ${pkg}`);
    }
    dependencies[pkg] ??= range;
  }
  packageFile.content = JSON.stringify(
    {
      ...packageJson,
      name: `sajtmaskin-dossier-${dossier.id}`,
      private: true,
      dependencies,
    },
    null,
    2,
  );

  return { dossier, scaffoldId, files };
}
