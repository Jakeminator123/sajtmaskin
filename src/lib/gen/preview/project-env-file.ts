/**
 * Per-project user-visible env file (`env.example`) generated into the
 * project filetree.
 *
 * Purpose: keep ALL env-variable trafficking out of the chat. The user
 * never has to answer "which env vars do you need?" in F2 — instead, every
 * detected/required key is silently parked in `env.example` with placeholder
 * values that document what the project COULD use. The only place a user
 * is ever asked to fill in real values is the F3 ("Bygg integrationer") flow, which
 * mounts `ProjectEnvVarsPanel`.
 *
 * IMPORTANT: this file is intentionally `env.example` (not `.env.local`,
 * not `.env`, not the prior `env.env`). Next.js does NOT load it at
 * runtime — it is a *documentation* artifact. The preview VM keeps
 * writing its own `.env.local` separately via `buildPreviewEnvLocalContents`
 * ({@link ./env-local.ts}); when downloading the project locally the
 * user copies `env.example` → `.env.local` and fills in real values.
 *
 * Filename history: previously `env.env`, which Next.js silently ignored
 * but which downloaded as a foreign-looking sibling next to `.env.local`
 * and confused users into thinking they had two competing env files.
 * Renamed 2026-04 to follow the standard `.example` convention.
 *
 * Layering matches `buildPreviewEnvLocalContents`
 * ({@link ./env-local.ts}): harmless placeholders + tier-3 stubs (F2 only)
 * + per-project preview tokens + user-stored values + values emitted by
 * the model. F3 strips the tier-3 stub layer so missing real values
 * surface as a runtime failure.
 */

import {
  buildProvenanceGroupedSections,
  dossierMockPreviewEnvValue,
  isPipelineAuthoredEnvLocal,
  resolvePreviewEnvLayers,
  type EnvVarProvenance,
  type PreviewLifecycleStage,
} from "@/lib/gen/preview/env-local";
import { detectIntegrationsFromVersionFiles } from "@/lib/gen/detect-integrations";

export const PROJECT_ENV_FILE_PATH = "env.example";
/**
 * Legacy filename — kept here so the injector can RIP this file out of
 * older versions when the new artifact is written. Removing this list
 * would silently leave the old `env.env` next to the new `env.example`
 * after a regeneration of an existing project.
 */
const LEGACY_PROJECT_ENV_FILE_PATHS = ["env.env", "./env.env"] as const;

const F2_HEADER = `# ─────────────────────────────────────────────────────────────────────
# env.example — DOCUMENTATION ONLY (F2 / fidelity 2)
# ─────────────────────────────────────────────────────────────────────
#
# Next.js läser INTE den här filen. Det är en hjälpkommentar som listar
# alla env-variabler din sajt kan tänkas använda. Sajtmaskin auto-fyller
# placeholder-värden så du kan se exakt vilka nycklar som finns.
#
# För att köra projektet LOKALT: kopiera den här filen till .env.local
# och fyll i riktiga värden. För preview/F2 i Sajtmaskin behöver du
# inte göra något — preview-VM:en bootar med interna placeholders.
#
# När du är redo att koppla på riktiga integrationer klickar du på
# "Bygg integrationer" — då får du en env-panel där du fyller i bara de nycklar
# som faktiskt behövs (t.ex. STRIPE_SECRET_KEY, RESEND_API_KEY).
#
# Allt nedan auto-regenereras vid varje generering. Egna ändringar i
# DEN HÄR filen skrivs över — fyll i .env.local lokalt istället, och
# använd env-panelen i builder:n för värden som ska persistenta i Sajtmaskin.
`;

const F3_HEADER = `# ─────────────────────────────────────────────────────────────────────
# env.example — DOCUMENTATION ONLY (F3 / fidelity 3)
# ─────────────────────────────────────────────────────────────────────
#
# Next.js läser INTE den här filen. Det är en hjälpkommentar som listar
# vilka env-variabler din sajt behöver. Tier-3-stubbar är bortskalade
# här — varje rad nedan som SAKNAR värde är något du måste fylla i
# via env-panelen i builderns högerspalt eller (lokalt) i .env.local
# innan sajten kan publiceras.
#
# Värden från env-panelen mergas in automatiskt vid nästa generering.
# Vill du köra lokalt: kopiera till .env.local och fyll i där.
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

/**
 * Section for env keys a SELECTED dossier declares that have no auto
 * placeholder (or, in F3, whose tier-3 stub was stripped). They render as
 * empty `KEY=` lines with the manifest `purpose` as a comment so the user
 * sees exactly what to fill in — without the old full-catalog dump.
 */
const DOSSIER_SCOPE_HEADER_F2 =
  "# ── Nycklar för valda byggblock (demo-värden i F2) ─────────────\n" +
  "# De här dossier:erna deklarerar nycklar utan auto-placeholder.\n" +
  "# I F2 fylls de med demo-värden (…_placeholder_preview_not_real) så\n" +
  "# preview funkar utan riktiga nycklar. Byt till riktiga värden i\n" +
  "# builderns env-panel när du klickar \"Bygg integrationer\" (F3).";

const DOSSIER_SCOPE_HEADER_F3 =
  "# ── Nycklar för valda byggblock (fyll i via env-panelen) ───────\n" +
  "# De här dossier:erna deklarerar nycklar utan auto-placeholder.\n" +
  "# Fyll i riktiga värden i builderns env-panel (eller lokalt i .env.local).";

/**
 * Opt-in dossier env scope. When provided (preflight always sends it),
 * `env.example` lists ONLY the project-specific layers (user / generated /
 * project-preview) plus placeholder-catalog keys that a selected dossier
 * actually declares — instead of dumping the whole harmless + tier-3 stub
 * catalogs. When omitted (legacy / unknown callsites) the full-dump behavior
 * is preserved so nothing silently changes outside preflight.
 */
export interface DossierEnvScope {
  envVars: Array<{ key: string; purpose?: string }>;
}

/** Provenance layers that describe THIS project (never a catalog dump). */
const PROJECT_SPECIFIC_PROVENANCE: ReadonlySet<EnvVarProvenance> = new Set<EnvVarProvenance>([
  "user",
  "generated",
  "project-preview",
]);

/**
 * Build the "keys for selected dossiers" section from the dossier env vars
 * that are NOT already emitted with a value in one of the kept layers.
 * Deduplicated by key; the first non-empty `purpose` wins.
 */
function buildDossierScopeSection(
  scope: DossierEnvScope,
  alreadyEmittedKeys: Set<string>,
  lifecycleStage: PreviewLifecycleStage,
): string | null {
  const isF2 = lifecycleStage !== "integrations";
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const envVar of scope.envVars) {
    const key = typeof envVar?.key === "string" ? envVar.key.trim() : "";
    if (!key || seen.has(key) || alreadyEmittedKeys.has(key)) continue;
    seen.add(key);
    const purpose = typeof envVar.purpose === "string" ? envVar.purpose.trim() : "";
    if (purpose) lines.push(`# ${purpose}`);
    // F2: show the deterministic demo value so the downloaded env.example
    // documents exactly the stub the preview boots with (the dossier renders
    // its mock/demo mode). F3: keep an empty line — a real value is required.
    lines.push(isF2 ? `${key}=${dossierMockPreviewEnvValue(key)}` : `${key}=`);
  }
  if (lines.length === 0) return null;
  const header = isF2 ? DOSSIER_SCOPE_HEADER_F2 : DOSSIER_SCOPE_HEADER_F3;
  return [header, ...lines].join("\n");
}

/**
 * Build a "detected integrations" section as a comment block. F2 only:
 * if the model still managed to wire in real integrations (despite the
 * F2 contract in the system prompt + the SDK guard fixer), surface them
 * as commented-out env-key hints so the user knows what would need to
 * be filled in if they hit "Bygg integrationer" — but never as active env values
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
    if (integration.key === "custom-email") {
      // Directly answer the common "do I need these?" question in the file:
      // these are the recipient/sender addresses for the contact/booking mail.
      lines.push(
        "#   ↳ Mottagar-/avsändaradresser för formulärmail. Sajten bootar utan dem,",
        "#     men mail skickas först när dessa + RESEND_API_KEY (och en verifierad",
        "#     avsändardomän) är satta — annars svarar formuläret 503 \"email-not-configured\".",
      );
    }
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
    "# utan dem. När du klickar \"Bygg integrationer\" kommer du få fylla i de",
    "# som faktiskt behövs.",
    "",
    ...lines,
  ].join("\n").trimEnd();
}

/**
 * Build the user-visible `env.example` file body with per-tier section
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
  /**
   * Opt-in dossier env scope. When provided, only the placeholder-catalog
   * keys a selected dossier declares are emitted (plus project-specific
   * layers); the full harmless + tier-3 catalog dump is dropped. Omit to keep
   * the legacy full-dump behavior. See {@link DossierEnvScope}.
   */
  dossierEnvScope?: DossierEnvScope;
}): Promise<string> {
  const lifecycleStage = params.lifecycleStage ?? "design";
  const { merged, provenance } = await resolvePreviewEnvLayers(params);

  // Dossier-scoped mode (preflight): keep the project-specific layers, keep
  // catalog keys ONLY when a selected dossier declares them, and drop the rest
  // of the harmless + tier-3 stub catalogs. Undefined scope → legacy full dump.
  let emittedMerged = merged;
  let emittedProvenance = provenance;
  let dossierScopeSection: string | null = null;
  if (params.dossierEnvScope) {
    const scopeKeys = new Set(
      params.dossierEnvScope.envVars
        .map((envVar) => (typeof envVar?.key === "string" ? envVar.key.trim() : ""))
        .filter((key) => key.length > 0),
    );
    const scopedMerged: Record<string, string> = {};
    const scopedProvenance: Record<string, EnvVarProvenance> = {};
    for (const key of Object.keys(merged)) {
      const prov = provenance[key] ?? "harmless";
      if (PROJECT_SPECIFIC_PROVENANCE.has(prov) || scopeKeys.has(key)) {
        scopedMerged[key] = merged[key];
        scopedProvenance[key] = prov;
      }
    }
    emittedMerged = scopedMerged;
    emittedProvenance = scopedProvenance;
    // Dossier keys not covered by a kept layer (never in the catalog, or a
    // tier-3 stub stripped in F3) become explicit lines with a purpose — a demo
    // value in F2, an empty line in F3.
    dossierScopeSection = buildDossierScopeSection(
      params.dossierEnvScope,
      new Set(Object.keys(scopedMerged)),
      lifecycleStage,
    );
  }

  const sections = buildProvenanceGroupedSections(
    emittedMerged,
    emittedProvenance,
    SECTION_HEADERS,
    SECTION_ORDER,
  );

  if (dossierScopeSection) sections.push(dossierScopeSection);

  // F2 only: surface any detected integration env-keys as comments so
  // the user can see them without them ever blocking boot. Keys already
  // emitted above (kept layers + dossier-scope section) are excluded.
  if (lifecycleStage !== "integrations" && params.projectFiles?.length) {
    const handledKeys = new Set<string>(Object.keys(emittedMerged));
    for (const envVar of params.dossierEnvScope?.envVars ?? []) {
      const key = typeof envVar?.key === "string" ? envVar.key.trim() : "";
      if (key) handledKeys.add(key);
    }
    const detectedBlock = buildDetectedIntegrationsCommentBlock(
      params.projectFiles,
      handledKeys,
    );
    if (detectedBlock) sections.push(detectedBlock);
  }

  const header = lifecycleStage === "integrations" ? F3_HEADER : F2_HEADER;
  return `${header}\n${sections.join("\n\n")}\n`;
}

type FileEntry = { path: string; content: string; language?: string };

/**
 * Find the `.env.local`/`.env` body the MODEL emitted, to use as the
 * "generated" provenance layer.
 *
 * Pipeline-authored env files are skipped: the scaffold merge can inject a
 * selected-dossier placeholder `.env.local` into a version's file set
 * (`project-scaffold.ts`), and older versions can still carry its former full
 * catalog. Treating either as "generated" would launder placeholder values
 * into project-specific provenance and bypass dossier scoping. Detection is by
 * the exact marker header the scaffold merge writes
 * ({@link isPipelineAuthoredEnvLocal}).
 */
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
      if (typeof file.content !== "string") continue;
      if (isPipelineAuthoredEnvLocal(file.content)) continue;
      return file.content;
    }
  }
  return null;
}

/**
 * Inject (or replace) the user-visible `env.example` artifact in `filesJson`.
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
    /**
     * Opt-in dossier env scope. Forwarded to {@link buildProjectEnvFileContents}
     * so `env.example` lists only the selected dossiers' env keys instead of
     * the full placeholder catalog. Omit for legacy full-dump behavior.
     */
    dossierEnvScope?: DossierEnvScope;
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
  // wired in despite the F2 contract. Strip both the new project env
  // path AND any legacy `env.env` carry-overs so they never show up
  // as "detected" hints in the new file.
  const isProjectOrLegacyEnvPath = (p: string | undefined) => {
    if (!p) return false;
    return (
      p === PROJECT_ENV_FILE_PATH ||
      p === `./${PROJECT_ENV_FILE_PATH}` ||
      LEGACY_PROJECT_ENV_FILE_PATHS.includes(p as (typeof LEGACY_PROJECT_ENV_FILE_PATHS)[number])
    );
  };

  const projectFiles = files
    .filter((f) => !isProjectOrLegacyEnvPath(f?.path) && typeof f?.content === "string")
    .map((f) => ({ path: f.path, content: f.content }));
  let contents: string;
  try {
    contents = await buildProjectEnvFileContents({
      appProjectId: params.appProjectId ?? null,
      generatedEnvLocal,
      lifecycleStage: params.lifecycleStage,
      projectFiles,
      dossierEnvScope: params.dossierEnvScope,
    });
  } catch (err) {
    console.warn(
      "[project-env-file] Failed to build env.example contents:",
      err instanceof Error ? err.message : err,
    );
    return filesJson;
  }

  // Drop both the canonical project env file (it gets re-added) AND any
  // legacy `env.env` so a re-generation cleans up after the rename.
  const withoutEnvFile = files.filter((f) => !isProjectOrLegacyEnvPath(f?.path));
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
