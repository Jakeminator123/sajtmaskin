/**
 * CLI: trace prepareGenerationContext() utan codegen.
 * Ligger under scripts/testning_scarf/ — kör alltid från repo-root.
 *
 *   npx tsx scripts/testning_scarf/trace-generation-context.ts --prompt-file prompt.txt
 *   ... --write-codegen-snapshot scripts/testning_scarf/output/codegen_snapshot/demo --strip-suite-note
 *
 * Laddar .env.local / .env från repo-root (OPENAI_API_KEY för embedding).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/** scripts/testning_scarf/ → repo-root */
const REPO_ROOT = path.resolve(__dirname, "../..");

function stripQuotes(value: string): string {
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf-8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = stripQuotes(trimmed.slice(eq + 1));
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile(path.join(REPO_ROOT, ".env.local"));
loadEnvFile(path.join(REPO_ROOT, ".env"));

type BuildIntent = "template" | "website" | "app";
type Step = { name: string; ms: number; detail?: Record<string, unknown> };

function nowMs(): number {
  return performance.now();
}

function readArg(flag: string, argv: string[]): string | null {
  const i = argv.indexOf(flag);
  if (i === -1 || i + 1 >= argv.length) return null;
  return argv[i + 1] ?? null;
}

function hasFlag(flag: string, argv: string[]): boolean {
  return argv.includes(flag);
}

/** Ta bort testsvit-anteckning i sparade *_prompt.txt. */
function stripSuitePromptNote(raw: string): string {
  const marker = "\n## Anteckning (testfall)";
  const idx = raw.indexOf(marker);
  const base = idx === -1 ? raw : raw.slice(0, idx);
  return base.trimEnd();
}

function readPrompt(argv: string[]): string {
  const file = readArg("--prompt-file", argv);
  if (file) {
    let t = fs.readFileSync(path.resolve(file), "utf-8").trimEnd();
    if (hasFlag("--strip-suite-note", argv)) {
      t = stripSuitePromptNote(t);
    }
    return t;
  }
  if (process.stdin.isTTY) {
    console.error(
      "Usage: npx tsx scripts/testning_scarf/trace-generation-context.ts --prompt-file <path> [--json]",
    );
    console.error(
      "Optional: --offline --portable-metadata --build-intent website|app|template --scaffold-mode auto|manual|off --scaffold-id <id>",
    );
    console.error(
      "          --brief-file <json> --custom-instructions-file <path> --dynamic-preview-chars <n>",
    );
    console.error(
      "          --write-codegen-snapshot <dir>  (skriver 01–04 filer som codegen-LLM matas med)",
    );
    console.error("          --strip-suite-note  (vid --prompt-file: ta bort ## Anteckning (testfall))");
    process.exit(1);
  }
  return fs.readFileSync(0, "utf-8").trimEnd();
}

const CODEGEN_README_SV = `# Codegen snapshot (vad kod-LLM:en matas med)

## Inte samma som trace.json

\`*_trace.json\` är en logg. Här ligger **fulltext** av det som egna motorn / v0 bygger från.

| Fil | Roll |
|-----|------|
| \`01_user_message.txt\` | User-meddelande (byggprompt). |
| \`02_engine_system_prompt.txt\` | Hela systemprompten för **egen motor** (STATIC_CORE + dynamik inkl. scaffold). |
| \`03_v0_enrichment_context.txt\` | Dynamisk kontext som i **v0-läget** blandas in i system (plus UI custom instructions). |
| \`04_snapshot_meta.json\` | Längder, resolved scaffold, offline-flagga. |

**~38k tecken:** det är ofta \`03_v0_enrichment_context.txt\` (dynamisk del). \`02_\` är ännu större (~59k) i typiskt landing-page-fall.

Embedding-anrop för scaffold/mall är **separata** från kodgenererings-LLM.
`;

function writeCodegenSnapshot(
  dir: string,
  prompt: string,
  orchestration: {
    engineSystemPrompt: string;
    v0EnrichmentContext: string;
    resolvedScaffold: { id: string; label: string } | null;
    scaffoldContext?: string;
  },
  opts: { offline: boolean; buildIntent: string; scaffoldMode: string; scaffoldId: string | null },
): void {
  const abs = path.isAbsolute(dir) ? dir : path.resolve(REPO_ROOT, dir);
  fs.mkdirSync(abs, { recursive: true });
  fs.writeFileSync(path.join(abs, "00_PIPELINE_README.md"), CODEGEN_README_SV, "utf-8");
  fs.writeFileSync(path.join(abs, "01_user_message.txt"), prompt + "\n", "utf-8");
  fs.writeFileSync(path.join(abs, "02_engine_system_prompt.txt"), orchestration.engineSystemPrompt + "\n", "utf-8");
  fs.writeFileSync(path.join(abs, "03_v0_enrichment_context.txt"), orchestration.v0EnrichmentContext + "\n", "utf-8");
  const meta = {
    offline: opts.offline,
    buildIntent: opts.buildIntent,
    scaffoldMode: opts.scaffoldMode,
    scaffoldIdArg: opts.scaffoldId,
    resolvedScaffoldId: orchestration.resolvedScaffold?.id ?? null,
    resolvedScaffoldLabel: orchestration.resolvedScaffold?.label ?? null,
    charCounts: {
      userMessage: prompt.length,
      engineSystemPrompt: orchestration.engineSystemPrompt.length,
      v0EnrichmentContext: orchestration.v0EnrichmentContext.length,
      scaffoldContext: orchestration.scaffoldContext?.length ?? 0,
    },
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
  };
  fs.writeFileSync(path.join(abs, "04_snapshot_meta.json"), JSON.stringify(meta, null, 2) + "\n", "utf-8");
  console.error(`[trace] Codegen snapshot → ${path.relative(REPO_ROOT, abs)}/`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const offline = hasFlag("--offline", argv);
  const portableMetadata = hasFlag("--portable-metadata", argv);
  const prompt = readPrompt(argv);

  const buildIntent = (readArg("--build-intent", argv) as BuildIntent | null) || "website";
  if (!["template", "website", "app"].includes(buildIntent)) {
    console.error("Invalid --build-intent (use website | app | template)");
    process.exit(1);
  }

  const scaffoldMode = (readArg("--scaffold-mode", argv) as "auto" | "manual" | "off" | null) || "auto";
  const scaffoldId = readArg("--scaffold-id", argv);
  const briefPath = readArg("--brief-file", argv);
  const customPath = readArg("--custom-instructions-file", argv);
  const previewChars = Math.min(
    120_000,
    Math.max(500, parseInt(readArg("--dynamic-preview-chars", argv) || "6000", 10) || 6000),
  );
  const codegenSnapshotDir = readArg("--write-codegen-snapshot", argv);

  let brief: Record<string, unknown> | null = null;
  if (briefPath) {
    brief = JSON.parse(fs.readFileSync(path.resolve(REPO_ROOT, briefPath), "utf-8")) as Record<
      string,
      unknown
    >;
  }

  let customInstructions: string | undefined;
  if (customPath) {
    customInstructions = fs.readFileSync(path.resolve(REPO_ROOT, customPath), "utf-8").trim();
    if (!customInstructions) customInstructions = undefined;
  }

  const steps: Step[] = [];
  const pushStep = (name: string, start: number, detail?: Record<string, unknown>) => {
    steps.push({ name, ms: Math.round((nowMs() - start) * 100) / 100, detail });
  };

  const { matchScaffold, matchScaffoldWithEmbeddings } = await import("@/lib/gen/scaffolds/matcher");
  const { searchScaffolds } = await import("@/lib/gen/scaffolds/scaffold-search");
  const { prepareGenerationContext } = await import("@/lib/gen/orchestrate");
  const { searchTemplateLibrary, searchTemplateLibraryKeywordsOnly } = await import(
    "@/lib/gen/template-library/search",
  );
  const { getSystemPromptLengths } = await import("@/lib/gen/system-prompt");
  const { detectScaffoldMode } = await import("@/lib/gen/scaffolds/serialize");

  const DOSSIER_ROOT = path.join(
    REPO_ROOT,
    "research",
    "external-templates",
    "reference-library",
    "dossiers",
  );

  let t = nowMs();
  const keywordScaffold = matchScaffold(prompt, buildIntent);
  pushStep("matchScaffold (keywords)", t, {
    id: keywordScaffold?.id ?? null,
    label: keywordScaffold?.label ?? null,
  });

  t = nowMs();
  let embeddingCandidates: Array<{ id: string; label: string; score: number }> = [];
  if (offline) {
    pushStep("searchScaffolds (embeddings)", t, { skipped: true, reason: "--offline" });
  } else {
    try {
      const raw = await searchScaffolds(prompt, 8);
      embeddingCandidates = raw.map((r) => ({
        id: r.scaffold.id,
        label: r.scaffold.label,
        score: Math.round(r.score * 10000) / 10000,
      }));
      pushStep("searchScaffolds (embeddings)", t, { top: embeddingCandidates.slice(0, 5) });
    } catch (e) {
      pushStep("searchScaffolds (embeddings)", t, { error: String(e) });
    }
  }

  t = nowMs();
  if (offline) {
    pushStep("matchScaffoldWithEmbeddings", t, { skipped: true, reason: "--offline (auto-match = keywords)" });
  } else {
    const resolvedByPipeline = await matchScaffoldWithEmbeddings(prompt, buildIntent);
    pushStep("matchScaffoldWithEmbeddings (full rules)", t, {
      id: resolvedByPipeline?.id ?? null,
      label: resolvedByPipeline?.label ?? null,
    });
  }

  t = nowMs();
  const orchestration = await prepareGenerationContext({
    prompt,
    buildIntent,
    scaffoldMode,
    scaffoldId: scaffoldId || null,
    brief,
    customInstructions,
    embeddingScaffoldMatch: !offline,
    embeddingEnrichment: !offline,
  });
  pushStep("prepareGenerationContext", t, {
    resolvedId: orchestration.resolvedScaffold?.id ?? null,
  });

  if (codegenSnapshotDir) {
    writeCodegenSnapshot(codegenSnapshotDir, prompt, orchestration, {
      offline,
      buildIntent,
      scaffoldMode,
      scaffoldId: scaffoldId || null,
    });
  }

  t = nowMs();
  let templateMatches: Array<{
    id: string;
    title: string;
    categoryName: string;
    qualityScore: number;
    matchScore: number;
    recommendedScaffoldFamilies: string[];
    dossierManifestPath: string;
    dossierExists: boolean;
  }> = [];
  try {
    const lib = offline
      ? searchTemplateLibraryKeywordsOnly(prompt, 8)
      : await searchTemplateLibrary(prompt, 8);
    templateMatches = lib.map((m) => {
      const id = m.entry.id;
      const manifestPath = path.join(DOSSIER_ROOT, id, "manifest.json");
      return {
        id,
        title: m.entry.title,
        categoryName: m.entry.categoryName,
        qualityScore: m.entry.qualityScore,
        matchScore: Math.round(m.score * 10000) / 10000,
        recommendedScaffoldFamilies: m.entry.recommendedScaffoldFamilies,
        dossierManifestPath: manifestPath,
        dossierExists: fs.existsSync(manifestPath),
      };
    });
    pushStep("searchTemplateLibrary (dossier-linked)", t, { count: templateMatches.length });
  } catch (e) {
    pushStep("searchTemplateLibrary (dossier-linked)", t, { error: String(e) });
  }

  const rs = orchestration.resolvedScaffold;
  const briefStyleKeywords = Array.isArray(
    (brief as { visualDirection?: { styleKeywords?: unknown } } | null)?.visualDirection?.styleKeywords,
  )
    ? ((brief as { visualDirection?: { styleKeywords?: unknown[] } }).visualDirection?.styleKeywords?.filter(
        (k): k is string => typeof k === "string" && k.trim().length > 0,
      ) ?? [])
    : undefined;
  const serializeMode = rs ? detectScaffoldMode(prompt, briefStyleKeywords) : null;

  const scaffoldFiles =
    rs?.files.map((f) => ({
      path: f.path,
      bytes: Buffer.byteLength(f.content, "utf8"),
    })) ?? [];

  const lens = getSystemPromptLengths(orchestration.engineSystemPrompt);
  const dynPreview = orchestration.v0EnrichmentContext.slice(0, previewChars);
  const dynTruncated = orchestration.v0EnrichmentContext.length > previewChars;

  const toRepoRel = (abs: string) => path.relative(REPO_ROOT, abs).split(path.sep).join("/");

  const out = {
    meta: {
      repoRoot: portableMetadata ? "." : REPO_ROOT,
      promptCharCount: prompt.length,
      buildIntent,
      scaffoldMode,
      scaffoldId: scaffoldId || null,
      briefProvided: Boolean(brief),
      customInstructionsChars: customInstructions?.length ?? 0,
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      offline,
      portableMetadata,
    },
    steps,
    scaffold: {
      keywordMatch: keywordScaffold
        ? { id: keywordScaffold.id, label: keywordScaffold.label, family: keywordScaffold.family }
        : null,
      embeddingTop: embeddingCandidates.slice(0, 5),
      resolved: rs
        ? {
            id: rs.id,
            label: rs.label,
            family: rs.family,
            description: rs.description,
            buildIntents: rs.buildIntents,
            serializeMode,
            fileCount: rs.files.length,
            files: scaffoldFiles,
          }
        : null,
      scaffoldContextChars: orchestration.scaffoldContext?.length ?? 0,
    },
    dossiers: {
      root: portableMetadata ? toRepoRel(DOSSIER_ROOT) : DOSSIER_ROOT,
      templateLibraryMatches: templateMatches.map((m) => ({
        ...m,
        dossierManifestPath: portableMetadata ? toRepoRel(m.dossierManifestPath) : m.dossierManifestPath,
      })),
      note:
        "Kuraterade referenser (template-library) kopplas till filsystem-dossiers under research/.../dossiers/<id> när de byggts med template-library-pipelinen.",
    },
    routePlan: orchestration.routePlan,
    capabilities: orchestration.capabilities,
    contracts: {
      dataMode: orchestration.preGenerationContracts.contracts.dataMode,
      databaseProvider: orchestration.preGenerationContracts.contracts.databaseProvider ?? null,
      authProvider: orchestration.preGenerationContracts.contracts.authProvider ?? null,
      paymentProvider: orchestration.preGenerationContracts.contracts.paymentProvider ?? null,
      integrations: orchestration.preGenerationContracts.contracts.integrations.slice(0, 8),
      envVars: orchestration.preGenerationContracts.contracts.envVars.slice(0, 10),
      unresolvedDecisions: orchestration.preGenerationContracts.unresolvedDecisions,
    },
    llm: {
      codegenExecuted: false,
      explanation:
        "Ingen streamText/codegen körs. För fulltext som kod-LLM ser: kör med --write-codegen-snapshot <dir> (01–04 filer).",
      systemPromptLengths: lens,
      userMessagePreview: prompt.slice(0, 2000) + (prompt.length > 2000 ? "\n…" : ""),
      dynamicContextPreview: dynPreview + (dynTruncated ? "\n\n… [truncate]" : ""),
      v0EnrichmentChars: orchestration.v0EnrichmentContext.length,
    },
  };

  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
