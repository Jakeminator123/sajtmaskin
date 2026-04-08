import fs from "node:fs";
import path from "node:path";
import { getAllScaffolds } from "../../src/lib/gen/scaffolds/registry";
import {
  runScaffoldManifestChecks,
  type ScaffoldManifestIssue,
} from "../../src/lib/gen/scaffolds/scaffold-manifest-validation";

type Severity = "ok" | "warning" | "error";

type CheckResult = {
  label: string;
  path: string;
  severity: Severity;
  message: string;
};

type ParsedJsonSummary = {
  summary: string;
  warning?: string;
};

function repoPath(...segments: string[]): string {
  return path.join(process.cwd(), ...segments);
}

function readJsonSummary(filePath: string): ParsedJsonSummary {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw) as Record<string, unknown>;

  if (Array.isArray(parsed.entries)) {
    return {
      summary: `${parsed.entries.length} entries`,
    };
  }
  if (parsed.scaffolds && typeof parsed.scaffolds === "object") {
    return {
      summary: `${Object.keys(parsed.scaffolds as Record<string, unknown>).length} scaffold entries`,
    };
  }
  if (Array.isArray(parsed.embeddings)) {
    return {
      summary: `${parsed.embeddings.length} embeddings`,
    };
  }
  if (Array.isArray(parsed.vectors)) {
    return {
      summary: `${parsed.vectors.length} vectors`,
    };
  }
  if (Array.isArray(parsed.items)) {
    return {
      summary: `${parsed.items.length} items`,
    };
  }

  return {
    summary: `parsed JSON (${Object.keys(parsed).length} top-level keys)`,
  };
}

function statMtimeMs(filePath: string): number | null {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function formatAge(filePath: string): string {
  const mtimeMs = statMtimeMs(filePath);
  if (!mtimeMs) return "unknown age";
  const ageMs = Math.max(0, Date.now() - mtimeMs);
  const ageMinutes = Math.round(ageMs / 60_000);
  if (ageMinutes < 60) return `${ageMinutes} min ago`;
  const ageHours = Math.round(ageMinutes / 60);
  return `${ageHours} h ago`;
}

function pushFileCheck(results: CheckResult[], label: string, relPath: string): void {
  const absPath = repoPath(...relPath.split("/"));
  if (!fs.existsSync(absPath)) {
    results.push({
      label,
      path: relPath,
      severity: "error",
      message: "missing",
    });
    return;
  }
  try {
    const { summary } = readJsonSummary(absPath);
    results.push({
      label,
      path: relPath,
      severity: "ok",
      message: `${summary} • ${formatAge(absPath)}`,
    });
  } catch (error) {
    results.push({
      label,
      path: relPath,
      severity: "error",
      message: error instanceof Error ? error.message : "invalid JSON",
    });
  }
}

function pushFreshnessCheck(results: CheckResult[], sourceRel: string, artifactRel: string, label: string): void {
  const sourceAbs = repoPath(...sourceRel.split("/"));
  const artifactAbs = repoPath(...artifactRel.split("/"));
  const sourceMtime = statMtimeMs(sourceAbs);
  const artifactMtime = statMtimeMs(artifactAbs);
  if (!sourceMtime || !artifactMtime) return;
  if (artifactMtime + 1_000 < sourceMtime) {
    results.push({
      label,
      path: artifactRel,
      severity: "warning",
      message: `older than ${sourceRel}`,
    });
  }
}

function pushTemplateEmbeddingAlignmentCheck(results: CheckResult[]): void {
  const catalogPath = repoPath("src", "lib", "gen", "template-library", "template-library.generated.json");
  const embeddingsPath = repoPath("src", "lib", "gen", "template-library", "template-library-embeddings.json");
  if (!fs.existsSync(catalogPath) || !fs.existsSync(embeddingsPath)) return;

  try {
    const catalogParsed = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as {
      entries?: Array<{ id?: string }>;
    };
    const embeddingsParsed = JSON.parse(fs.readFileSync(embeddingsPath, "utf8")) as {
      embeddings?: Array<{ id?: string }>;
    };

    const catalogIds = new Set(
      (catalogParsed.entries ?? [])
        .map((entry) => entry.id?.trim())
        .filter((id): id is string => Boolean(id)),
    );
    const embeddingIds = new Set(
      (embeddingsParsed.embeddings ?? [])
        .map((entry) => entry.id?.trim())
        .filter((id): id is string => Boolean(id)),
    );

    const missingEmbeddings = [...catalogIds].filter((id) => !embeddingIds.has(id));
    const orphanEmbeddings = [...embeddingIds].filter((id) => !catalogIds.has(id));

    if (missingEmbeddings.length === 0 && orphanEmbeddings.length === 0) {
      results.push({
        label: "Template embedding id alignment",
        path: "src/lib/gen/template-library/template-library-embeddings.json",
        severity: "ok",
        message: `catalog ids and embeddings ids aligned (${catalogIds.size} ids)`,
      });
      return;
    }

    const missingSample = missingEmbeddings.slice(0, 4).join(", ");
    const orphanSample = orphanEmbeddings.slice(0, 4).join(", ");
    results.push({
      label: "Template embedding id alignment",
      path: "src/lib/gen/template-library/template-library-embeddings.json",
      severity: "error",
      message:
        `id mismatch between template catalog and embeddings. ` +
        `missing embeddings: ${missingEmbeddings.length}${missingSample ? ` (${missingSample})` : ""}; ` +
        `orphan embeddings: ${orphanEmbeddings.length}${orphanSample ? ` (${orphanSample})` : ""}`,
    });
  } catch (error) {
    results.push({
      label: "Template embedding id alignment",
      path: "src/lib/gen/template-library/template-library-embeddings.json",
      severity: "error",
      message: error instanceof Error ? error.message : "failed to parse embedding/catalog JSON",
    });
  }
}

function printResults(title: string, results: CheckResult[]) {
  console.log(`\n## ${title}`);
  for (const result of results) {
    const prefix =
      result.severity === "ok"
        ? "[ok]"
        : result.severity === "warning"
          ? "[warn]"
          : "[error]";
    console.log(`${prefix} ${result.label}`);
    console.log(`       ${result.path}`);
    console.log(`       ${result.message}`);
  }
}

function printScaffoldIssues(issues: ScaffoldManifestIssue[]) {
  console.log("\n## Scaffold manifest checks");
  if (issues.length === 0) {
    console.log("[ok] No scaffold manifest issues.");
    return;
  }
  for (const issue of issues) {
    const prefix = issue.severity === "error" ? "[error]" : "[warn]";
    console.log(`${prefix} ${issue.scaffoldId}: ${issue.message}`);
  }
}

function main() {
  const artifactChecks: CheckResult[] = [];
  const sourceChecks: CheckResult[] = [];

  pushFileCheck(
    artifactChecks,
    "Runtime template catalog",
    "src/lib/gen/template-library/template-library.generated.json",
  );
  pushFileCheck(
    artifactChecks,
    "Runtime template embeddings",
    "src/lib/gen/template-library/template-library-embeddings.json",
  );
  pushFileCheck(
    artifactChecks,
    "Runtime scaffold research",
    "src/lib/gen/scaffolds/scaffold-research.generated.json",
  );
  pushFileCheck(
    artifactChecks,
    "Runtime scaffold embeddings",
    "src/lib/gen/scaffolds/scaffold-embeddings.json",
  );

  pushFileCheck(
    sourceChecks,
    "Raw discovery catalog",
    "data/external-template-pipeline/raw-discovery/current/catalog.json",
  );
  pushFileCheck(
    sourceChecks,
    "Raw discovery summary",
    "data/external-template-pipeline/raw-discovery/current/summary.json",
  );

  pushFreshnessCheck(
    artifactChecks,
    "data/external-template-pipeline/raw-discovery/current/catalog.json",
    "src/lib/gen/template-library/template-library.generated.json",
    "Runtime template catalog freshness",
  );
  pushFreshnessCheck(
    artifactChecks,
    "src/lib/gen/template-library/template-library.generated.json",
    "src/lib/gen/scaffolds/scaffold-research.generated.json",
    "Scaffold research freshness",
  );
  pushTemplateEmbeddingAlignmentCheck(artifactChecks);

  printResults("Runtime artifacts", artifactChecks);
  printResults("Research inputs", sourceChecks);

  const scaffolds = getAllScaffolds();
  console.log(`\n## Runtime scaffold families\n[ok] ${scaffolds.length} manifests loaded from src/lib/gen/scaffolds/`);

  const issues = runScaffoldManifestChecks();
  printScaffoldIssues(issues);

  const hardErrors = [
    ...artifactChecks,
    ...sourceChecks,
  ].some((result) => result.severity === "error");
  const scaffoldErrors = issues.some((issue) => issue.severity === "error");
  if (hardErrors || scaffoldErrors) {
    process.exitCode = 1;
  }
}

main();
