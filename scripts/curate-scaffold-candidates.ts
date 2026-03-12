import fs from "node:fs";
import path from "node:path";
import type { TemplateLibraryCatalogFile, TemplateLibraryEntry } from "../src/lib/gen/template-library/types";
import { writeScaffoldCandidateReport } from "./scaffold-candidate-report";
import { slugify } from "./template-library-discovery";

type LegacyCandidate = {
  slug?: string;
  name?: string;
  description?: string;
  url?: string;
};

const DEFAULT_INPUT_PATH = path.resolve(
  process.cwd(),
  "src/lib/gen/template-library/template-library.generated.json",
);
const DEFAULT_OUTPUT_PATH = path.resolve(process.cwd(), "data/scaffold-candidates-curated.json");

function parseArgs(): { inputPath: string; outputPath: string } {
  const args = process.argv.slice(2);
  const positional = args.find((arg) => !arg.startsWith("--"));
  const explicitInput = args.find((arg) => arg.startsWith("--input="))?.slice("--input=".length);
  const explicitOutput = args.find((arg) => arg.startsWith("--output="))?.slice("--output=".length);

  return {
    inputPath: path.resolve(explicitInput ?? positional ?? DEFAULT_INPUT_PATH),
    outputPath: path.resolve(explicitOutput ?? DEFAULT_OUTPUT_PATH),
  };
}

function emptyRepoInfo(): TemplateLibraryEntry["repo"] {
  return {
    url: null,
    normalizedUrl: null,
    subpath: null,
    clonePath: null,
    packageManager: "unknown",
    hasNext: false,
    hasReact: false,
    isMonorepo: false,
    hasAppDir: false,
    hasSrcAppDir: false,
  };
}

function emptySignals(): TemplateLibraryEntry["signals"] {
  return {
    auth: false,
    dashboard: false,
    pricing: false,
    blog: false,
    portfolio: false,
    ecommerce: false,
    docs: false,
    ai: false,
    multiTenant: false,
    cms: false,
  };
}

function inferLegacyFamilies(candidate: LegacyCandidate): TemplateLibraryEntry["recommendedScaffoldFamilies"] {
  const text = `${candidate.slug ?? ""} ${candidate.name ?? ""} ${candidate.description ?? ""}`.toLowerCase();
  if (/\b(auth|login|signup|password)\b/.test(text)) return ["auth-pages"];
  if (/\b(ecommerce|shop|store|checkout|product)\b/.test(text)) return ["ecommerce"];
  if (/\b(dashboard|admin|analytics)\b/.test(text)) return ["dashboard"];
  if (/\b(blog|editorial|newsletter)\b/.test(text)) return ["blog"];
  if (/\b(portfolio|creative|gallery)\b/.test(text)) return ["portfolio"];
  if (/\b(saas|pricing|billing|workspace)\b/.test(text)) return ["saas-landing"];
  return ["landing-page"];
}

function legacyQualityScore(candidate: LegacyCandidate): number {
  const text = `${candidate.slug ?? ""} ${candidate.name ?? ""} ${candidate.description ?? ""}`.toLowerCase();
  if (/\b(restaurant|booking|reservation|clinic|salon|event|conference|wedding|nonprofit|charity|association|ecommerce|shop|store|saas|portfolio|blog)\b/.test(text)) {
    return 82;
  }
  if (/\b(documentation|docs|landing|marketing|starter|dashboard|admin|cms|authentication)\b/.test(text)) {
    return 68;
  }
  if (/\b(web3|blockchain|monorepo|microfrontend|edge-config|experimentation|flags|cdn)\b/.test(text)) {
    return 32;
  }
  return 52;
}

function normalizeLegacyCandidates(rawCandidates: LegacyCandidate[]): TemplateLibraryEntry[] {
  return rawCandidates.map((candidate) => {
    const title = candidate.name?.trim() || candidate.slug?.trim() || "Legacy Candidate";
    const id = slugify(candidate.slug?.trim() || title);
    const description = candidate.description?.trim() || "";
    const recommendedScaffoldFamilies = inferLegacyFamilies(candidate);
    const qualityScore = legacyQualityScore(candidate);
    return {
      id,
      slug: id,
      title,
      categorySlug: "legacy-candidate",
      categoryName: "Legacy Candidate",
      templateUrl: candidate.url?.trim() || "",
      demoUrl: null,
      description,
      frameworkReason: "Legacy scaffold candidate import",
      frameworkMatch: true,
      verdict: qualityScore >= 60 ? "research_only" : "unverified",
      qualityScore,
      repo: emptyRepoInfo(),
      stackTags: [],
      usefulLines: [],
      noiseLines: [],
      strengths: recommendedScaffoldFamilies.map((family) => `${family} alignment`),
      weaknesses: qualityScore < 60 ? ["Legacy candidate without curated dossier"] : [],
      recommendedScaffoldFamilies,
      signals: emptySignals(),
      summary: description || `${title} imported from legacy scaffold candidate list.`,
      selectedFiles: [],
    };
  });
}

function readEntries(inputPath: string): TemplateLibraryEntry[] {
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf-8")) as
    | TemplateLibraryCatalogFile
    | { candidates?: LegacyCandidate[] };

  if (Array.isArray((raw as TemplateLibraryCatalogFile).entries)) {
    return (raw as TemplateLibraryCatalogFile).entries;
  }

  if (Array.isArray((raw as { candidates?: LegacyCandidate[] }).candidates)) {
    return normalizeLegacyCandidates((raw as { candidates?: LegacyCandidate[] }).candidates ?? []);
  }

  throw new Error(
    `Unsupported input at ${inputPath}. Expected template-library catalog with entries[] or legacy candidates[].`,
  );
}

function main(): void {
  const { inputPath, outputPath } = parseArgs();
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const entries = readEntries(inputPath);
  const { report } = writeScaffoldCandidateReport(entries, {
    outputPath,
    source: "scripts/curate-scaffold-candidates.ts",
    input: inputPath,
  });

  console.log(`Curated ${report._meta.total} candidates:`);
  console.log(`  High priority: ${report._meta.high}`);
  console.log(`  Medium:        ${report._meta.medium}`);
  console.log(`  Ignored:       ${report._meta.ignored}`);
  console.log(`Output: ${outputPath}`);
}

main();
