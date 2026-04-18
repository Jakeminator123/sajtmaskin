/**
 * Per-project user-visible env file (`env.env`) generated into the project
 * filetree.
 *
 * Purpose: keep ALL env-variable trafficking out of the chat. The user
 * never has to answer "which env vars do you need?" in F2 — instead, every
 * detected/required key is silently parked in `env.env` with placeholder
 * values that boot the project. The only place a user is ever asked to
 * fill in real values is the F3 ("Bygg nu") flow, which mounts
 * `ProjectEnvVarsPanel`.
 *
 * Layering matches `buildPreviewEnvLocalContents`
 * ({@link ./env-local.ts}): harmless placeholders + tier-3 stubs (F2 only)
 * + per-project preview tokens + user-stored values + values emitted by
 * the model. F3 strips the tier-3 stub layer so missing real values
 * surface as a runtime failure.
 *
 * The file is mounted in `versions.files_json` via
 * {@link injectProjectEnvFileIntoFilesJson} so it appears in the builder's
 * file panel just like any other generated file. Preview-VM bootstrap
 * keeps writing its own `.env.local` separately — `env.env` is the
 * user-visible spelling + explanation document.
 */

import {
  resolvePreviewEnvLayers,
  type EnvVarProvenance,
  type PreviewLifecycleStage,
} from "@/lib/gen/preview/env-local";
import { detectIntegrationsFromVersionFiles } from "@/lib/gen/detect-integrations";

export const PROJECT_ENV_FILE_PATH = "env.env";

const F2_HEADER = `# ─────────────────────────────────────────────────────────────────────
# env.env — auto-genererad miljöfil för det här projektet (F2 / fidelity 2)
# ─────────────────────────────────────────────────────────────────────
#
# Den här filen skapas automatiskt av Sajtmaskin så att din sajt kan
# bootas i preview även om den importerar saker som Stripe, Supabase,
# Redis eller liknande. Värdena nedan är PLACEHOLDERS — de gör att
# koden kompilerar och kör, men inga riktiga externa anrop fungerar.
#
# Du behöver INTE fylla i något här i F2. När du är redo att koppla på
# riktiga integrationer klickar du på "Bygg nu"-knappen ovanför
# previewen. Då går projektet upp i F3 / fidelity 3, och du får en panel
# där du kan fylla i bara de nycklar som faktiskt behövs (t.ex.
# STRIPE_SECRET_KEY, KLARNA_API_SECRET, REDIS_URL).
#
# Allt nedan auto-regenereras vid varje generering — egna ändringar i
# den här filen skrivs över. För riktiga värden, använd "Bygg nu" → env-panelen.
`;

const F3_HEADER = `# ─────────────────────────────────────────────────────────────────────
# env.env — projekt-miljöfil (F3 / fidelity 3)
# ─────────────────────────────────────────────────────────────────────
#
# Du har klickat "Bygg nu" och projektet är i F3. Tier-3-stubbar är
# bortskalade här — varje rad nedan som SAKNAR värde måste fyllas i
# via env-panelen i builderns högerspalt innan sajten kan publiceras.
#
# Värden från env-panelen mergas in automatiskt vid nästa generering.
# Du kan också skriva direkt här lokalt om du föredrar det, men
# panel-värden vinner vid konflikt.
`;

const SECTION_HEADERS: Record<EnvVarProvenance, string> = {
  user:
    "# ── Dina ifyllda värden (env-panelen) ──────────────────────────\n" +
    "# Mergas in från projektets sparade env-variabler.",
  generated:
    "# ── Värden modellen själv satte ────────────────────────────────\n" +
    "# Lades in av kod-genereringen. Skrivs över om du sätter värden\n" +
    "# i env-panelen.",
  "project-preview":
    "# ── Stabila projekt-tokens (auto) ───────────────────────────────\n" +
    "# Härleds från projekt-id, oförändrade mellan körningar.",
  "tier3-stub":
    "# ── Tier-3 placeholders (auto, bara F2) ─────────────────────────\n" +
    "# Bootar projektet med fake-värden så det går att klicka runt.\n" +
    "# Skalas bort i F3 — då måste riktiga värden fyllas i via panelen.",
  harmless:
    "# ── Säkra placeholders (auto, OK i F3 också) ────────────────────\n" +
    "# Test/publishable-nycklar och generiska secrets — inte hemliga.",
};

const SECTION_ORDER: EnvVarProvenance[] = [
  "user",
  "generated",
  "project-preview",
  "tier3-stub",
  "harmless",
];

function quoteEnvValue(val: string): string {
  if (val === "") return '""';
  if (/[\s#"'\\]/.test(val) || val.includes("\n")) {
    return `"${val
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")}"`;
  }
  return val;
}

/**
 * Build a "detected integrations" section as a comment block. F2 only:
 * if the model still managed to wire in real integrations (despite the
 * F2 contract in the system prompt + the SDK guard fixer), surface them
 * as commented-out env-key hints so the user knows what would need to
 * be filled in if they hit "Bygg nu" — but never as active env values
 * that could block boot.
 */
function buildDetectedIntegrationsCommentBlock(
  files: ReadonlyArray<{ path: string; content: string }>,
  alreadyHandledKeys: Set<string>,
): string | null {
  if (files.length === 0) return null;
  let detected: ReturnType<typeof detectIntegrationsFromVersionFiles>;
  try {
    // Pass lifecycleStage:"integrations" here so we get the FULL list
    // (manifest + custom-env). We're rendering them as comments, not
    // as active blockers — F2 muting is enforced by the comment format,
    // not by suppressing detection.
    detected = detectIntegrationsFromVersionFiles(
      files.map((f) => ({ name: f.path, content: f.content })),
      { lifecycleStage: "integrations" },
    );
  } catch {
    return null;
  }
  if (!detected || detected.length === 0) return null;

  const lines: string[] = [];
  for (const integration of detected) {
    const keys = (integration.envVars ?? []).filter(
      (key) => key && !alreadyHandledKeys.has(key),
    );
    if (keys.length === 0) continue;
    lines.push(`# ${integration.name}${integration.provider ? ` (${integration.provider})` : ""}`);
    for (const key of keys) {
      lines.push(`# ${key}=`);
    }
    lines.push("");
  }
  if (lines.length === 0) return null;

  return [
    "# ── Upptäckta integrationer i koden (kommenterade, inaktiva) ────",
    "# Modellen har refererat till dessa env-variabler i den genererade",
    "# koden. De är AVSIKTLIGT kommenterade i F2 — sajten ska bootas",
    "# utan dem. När du klickar \"Bygg nu\" kommer du få fylla i de",
    "# som faktiskt behövs.",
    "",
    ...lines,
  ].join("\n").trimEnd();
}

/**
 * Build the user-visible `env.env` file body with per-tier section
 * comments. Layering and merge order follows {@link resolvePreviewEnvLayers}.
 */
export async function buildProjectEnvFileContents(params: {
  appProjectId?: string | null;
  /** Raw `.env.local` body emitted by the model, if any. */
  generatedEnvLocal?: string | null;
  /** F2 (`design`) keeps tier-3 stubs; F3 (`integrations`) strips them. */
  lifecycleStage?: PreviewLifecycleStage;
  /** Project files used to scan for "detected but commented" hints in F2. */
  projectFiles?: ReadonlyArray<{ path: string; content: string }>;
}): Promise<string> {
  const lifecycleStage = params.lifecycleStage ?? "design";
  const { merged, provenance } = await resolvePreviewEnvLayers(params);

  const groups: Record<EnvVarProvenance, string[]> = {
    user: [],
    generated: [],
    "project-preview": [],
    "tier3-stub": [],
    harmless: [],
  };

  for (const key of Object.keys(merged).sort((a, b) => a.localeCompare(b))) {
    const tier = provenance[key] ?? "harmless";
    groups[tier].push(`${key}=${quoteEnvValue(merged[key] ?? "")}`);
  }

  const sections: string[] = [];
  for (const tier of SECTION_ORDER) {
    if (groups[tier].length === 0) continue;
    sections.push(SECTION_HEADERS[tier]);
    sections.push(groups[tier].join("\n"));
  }

  // F2 only: surface any detected integration env-keys as comments so
  // the user can see them without them ever blocking boot.
  if (lifecycleStage !== "integrations" && params.projectFiles?.length) {
    const detectedBlock = buildDetectedIntegrationsCommentBlock(
      params.projectFiles,
      new Set(Object.keys(merged)),
    );
    if (detectedBlock) sections.push(detectedBlock);
  }

  const header = lifecycleStage === "integrations" ? F3_HEADER : F2_HEADER;
  return `${header}\n${sections.join("\n\n")}\n`;
}

type FileEntry = { path: string; content: string; language?: string };

function extractGeneratedEnvLocal(files: FileEntry[]): string | null {
  for (const file of files) {
    if (!file?.path) continue;
    const normalized = file.path.replace(/^\.\//, "").replace(/\\/g, "/");
    if (
      normalized === ".env.local" ||
      normalized === ".env" ||
      normalized.endsWith("/.env.local") ||
      normalized.endsWith("/.env")
    ) {
      return typeof file.content === "string" ? file.content : null;
    }
  }
  return null;
}

/**
 * Inject (or replace) the user-visible `env.env` artifact in `filesJson`.
 *
 * Reads any `.env.local` the model emitted as the "generated" layer, then
 * builds the merged file body via {@link buildProjectEnvFileContents}.
 * Returns the original string unchanged on parse failure.
 */
export async function injectProjectEnvFileIntoFilesJson(
  filesJson: string,
  params: {
    appProjectId?: string | null;
    lifecycleStage?: PreviewLifecycleStage;
  },
): Promise<string> {
  let files: FileEntry[];
  try {
    const parsed = JSON.parse(filesJson);
    if (!Array.isArray(parsed)) return filesJson;
    files = parsed as FileEntry[];
  } catch {
    return filesJson;
  }

  const generatedEnvLocal = extractGeneratedEnvLocal(files);
  // Pass the project files so the F2 builder can render
  // "detected but commented" hints for integrations the model still
  // wired in despite the F2 contract.
  const projectFiles = files
    .filter(
      (f) =>
        f?.path !== PROJECT_ENV_FILE_PATH &&
        f?.path !== `./${PROJECT_ENV_FILE_PATH}` &&
        typeof f?.content === "string",
    )
    .map((f) => ({ path: f.path, content: f.content }));
  let contents: string;
  try {
    contents = await buildProjectEnvFileContents({
      appProjectId: params.appProjectId ?? null,
      generatedEnvLocal,
      lifecycleStage: params.lifecycleStage,
      projectFiles,
    });
  } catch (err) {
    console.warn(
      "[project-env-file] Failed to build env.env contents:",
      err instanceof Error ? err.message : err,
    );
    return filesJson;
  }

  const withoutEnvFile = files.filter(
    (f) =>
      f?.path !== PROJECT_ENV_FILE_PATH &&
      f?.path !== `./${PROJECT_ENV_FILE_PATH}`,
  );
  const next: FileEntry[] = [
    ...withoutEnvFile,
    {
      path: PROJECT_ENV_FILE_PATH,
      content: contents,
      language: "dotenv",
    },
  ];

  return JSON.stringify(next);
}
