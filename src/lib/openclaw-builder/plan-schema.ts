/**
 * Structured shadow.plan result. Parse/validate only — no I/O, no model
 * calls, and no fields that pick a new scaffold, variant, or dossier.
 */

export const SHADOW_PLAN_SCHEMA_VERSION = 1 as const;
export const SHADOW_PLAN_TOOL = "shadow.plan" as const;

export const HEX64_RE = /^[0-9a-f]{64}$/;
export const MAX_GOAL_LENGTH = 400;
export const MAX_PLAN_ARRAY_LENGTH = 32;
export const MAX_EXPECTED_FILE_PATH_LENGTH = 200;
export const MAX_PLAN_ITEM_LENGTH = 240;

const SECRET_PATTERN_RE = /bearer|sk-|rk[_-]|whsec|BEGIN PRIVATE|api[_-]?key/i;

const RESTRICTED_EXPECTED_BASENAMES = new Set([
  ".env",
  ".npmrc",
  ".netrc",
  ".yarnrc.yml",
  ".pypirc",
  "id_rsa",
  "id_ed25519",
  "credentials.json",
  "service-account.json",
  "package-lock.json",
]);

export const SHADOW_PLAN_CONTRACTS = [
  "GenerationInputPackage",
  "BuildSpec",
  "scaffold",
  "variant",
  "dossiers",
  "source_receipt",
  "engine_versions.files_json",
  "RenderGate",
  "ReleaseGate",
  "finalize",
] as const;

export type ShadowPlanContract = (typeof SHADOW_PLAN_CONTRACTS)[number];

export type ShadowPlan = {
  schemaVersion: 1;
  tool: "shadow.plan";
  generationInputPackageHash: string;
  lineageHash: string;
  goal: string;
  expectedFiles: string[];
  contracts: string[];
  risks: string[];
  checkPlan: string[];
  notes: string[];
};

export type ParseShadowPlanResult =
  | { ok: true; plan: ShadowPlan }
  | { ok: false; code: "invalid_plan" };

const PLAN_KEYS = new Set([
  "schemaVersion",
  "tool",
  "generationInputPackageHash",
  "lineageHash",
  "goal",
  "expectedFiles",
  "contracts",
  "risks",
  "checkPlan",
  "notes",
]);

const CONTRACT_SET: ReadonlySet<string> = new Set(SHADOW_PLAN_CONTRACTS);

const INVALID: ParseShadowPlanResult = { ok: false, code: "invalid_plan" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isHex64(value: unknown): value is string {
  return typeof value === "string" && HEX64_RE.test(value);
}

function hasIllegalControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 9 || code === 10) continue;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

function isRestrictedExpectedPath(value: string): boolean {
  const basename = (value.split("/").pop() ?? "").toLowerCase();
  if (!basename) return true;
  if (basename === ".env" || basename.startsWith(".env.")) return true;
  if (RESTRICTED_EXPECTED_BASENAMES.has(basename)) return true;
  if (basename.endsWith(".pem") || basename.endsWith(".key")) return true;
  if (value === ".git/config" || value.startsWith(".git/")) return true;
  return false;
}

function isSafeRelativePath(value: string): boolean {
  if (value.length === 0 || value.length > MAX_EXPECTED_FILE_PATH_LENGTH) return false;
  if (value.includes("\\") || value.includes("\0")) return false;
  if (value.startsWith("/") || /^[a-zA-Z]:/.test(value)) return false;
  const segments = value.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return false;
  }
  return !isRestrictedExpectedPath(value);
}

function parseStringList(
  value: unknown,
  itemOk: (item: string) => boolean,
): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_PLAN_ARRAY_LENGTH) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || item.length === 0 || !itemOk(item)) return null;
    out.push(item);
  }
  return out;
}

function isBoundedItem(item: string): boolean {
  if (item.length > MAX_PLAN_ITEM_LENGTH) return false;
  if (hasIllegalControlChars(item)) return false;
  if (SECRET_PATTERN_RE.test(item)) return false;
  return true;
}

function isAllowedContract(item: string): boolean {
  return CONTRACT_SET.has(item);
}

export function parseShadowPlan(input: unknown): ParseShadowPlanResult {
  if (!isRecord(input)) return INVALID;

  for (const key of Object.keys(input)) {
    if (!PLAN_KEYS.has(key)) return INVALID;
  }

  if (input.schemaVersion !== SHADOW_PLAN_SCHEMA_VERSION) return INVALID;
  if (input.tool !== SHADOW_PLAN_TOOL) return INVALID;
  if (!isHex64(input.generationInputPackageHash)) return INVALID;
  if (!isHex64(input.lineageHash)) return INVALID;

  if (typeof input.goal !== "string") return INVALID;
  if (input.goal.length < 1 || input.goal.length > MAX_GOAL_LENGTH) return INVALID;
  if (SECRET_PATTERN_RE.test(input.goal)) return INVALID;

  const expectedFiles = parseStringList(input.expectedFiles, isSafeRelativePath);
  if (!expectedFiles) return INVALID;

  const contracts = parseStringList(input.contracts, isAllowedContract);
  if (!contracts) return INVALID;

  const risks = parseStringList(input.risks, isBoundedItem);
  if (!risks) return INVALID;

  const checkPlan = parseStringList(input.checkPlan, isBoundedItem);
  if (!checkPlan) return INVALID;

  const notes = parseStringList(input.notes, isBoundedItem);
  if (!notes) return INVALID;

  return {
    ok: true,
    plan: {
      schemaVersion: SHADOW_PLAN_SCHEMA_VERSION,
      tool: SHADOW_PLAN_TOOL,
      generationInputPackageHash: input.generationInputPackageHash,
      lineageHash: input.lineageHash,
      goal: input.goal,
      expectedFiles,
      contracts,
      risks,
      checkPlan,
      notes,
    },
  };
}
